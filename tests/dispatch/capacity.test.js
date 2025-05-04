import { describe, expect, it } from 'vitest';
import {
  demandFor,
  supplyFrom,
  planDay,
  whoIsFree,
  shortfallLines,
} from '../../src/dispatch/capacity.js';
import { buildRoster } from '../../src/dispatch/locator.js';
import { buildAssignment } from '../../src/dispatch/assign.js';
import { buildTicket } from '../../src/ticket/record.js';

const roster = buildRoster([
  { id: 'loc-1', skills: ['gas', 'electric'], districts: ['central'], dailyCapacity: 4 },
  { id: 'loc-2', skills: ['gas'], districts: ['central'], dailyCapacity: 2 },
  { id: 'loc-3', skills: ['water'], dailyCapacity: 3 },
  { id: 'loc-4', skills: ['gas'], districts: ['central'], dailyCapacity: 5, active: 'N' },
]);

function ticket(number) {
  return buildTicket({
    number,
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
  });
}

function entry(number, types = ['GAS'], districts = ['CENTRAL'], ours = true) {
  return {
    ticket: ticket(number),
    screening: {
      ours,
      districts,
      hits: types.map((type) => ({ type, insideTolerance: true, abandoned: false })),
    },
  };
}

describe('demandFor', () => {
  it('counts the tickets and what they need', () => {
    const demand = demandFor([entry('B240315000420'), entry('B240315000421', ['GAS', 'WATER'])]);
    expect(demand.tickets).toBe(2);
    expect(demand.byType).toEqual({ GAS: 2, WATER: 1 });
    expect(demand.byDistrict).toEqual({ CENTRAL: 2 });
  });

  it('leaves out tickets that are not ours', () => {
    const demand = demandFor([entry('B240315000420'), entry('B240315000421', ['GAS'], [], false)]);
    expect(demand.tickets).toBe(1);
  });

  it('buckets a ticket with no district', () => {
    expect(demandFor([entry('B240315000420', ['GAS'], [])]).byDistrict).toEqual({ UNPLACED: 1 });
  });

  it('counts nothing from nothing', () => {
    expect(demandFor([]).tickets).toBe(0);
  });
});

describe('supplyFrom', () => {
  it('adds up what the roster can take', () => {
    const supply = supplyFrom(roster);
    expect(supply.total).toBe(9);
    expect(supply.byType.GAS).toBe(6);
    expect(supply.byType.WATER).toBe(3);
  });

  it('leaves an inactive locator out', () => {
    expect(supplyFrom(roster).byType.GAS).toBe(6);
  });

  it('nets off what is already held', () => {
    const assignments = [
      buildAssignment({ number: 'B1', locatorId: 'loc-1', at: '2024-03-15T08:00', by: 'd' }),
      buildAssignment({ number: 'B2', locatorId: 'loc-1', at: '2024-03-15T09:00', by: 'd' }),
    ];
    expect(supplyFrom(roster, { assignments, date: '2024-03-15' }).total).toBe(7);
  });

  it('buckets a locator with no district under any', () => {
    expect(supplyFrom(roster).byDistrict.ANY).toBe(3);
    expect(supplyFrom(roster).byDistrict.CENTRAL).toBe(6);
  });
});

describe('planDay', () => {
  it('says the day fits when it does', () => {
    const plan = planDay([entry('B240315000420')], roster, { date: '2024-03-15' });
    expect(plan.fits).toBe(true);
    expect(plan.shortfalls).toEqual([]);
  });

  it('names a total shortfall', () => {
    const entries = Array.from({ length: 12 }, (unused, index) =>
      entry(`B24031500042${index % 10}`)
    );
    const plan = planDay(entries, roster, { date: '2024-03-15' });
    expect(plan.fits).toBe(false);
    expect(plan.shortfalls.some((entry) => entry.kind === 'total')).toBe(true);
  });

  it('names a skill shortfall even when the total fits', () => {
    const entries = Array.from({ length: 5 }, (unused, index) =>
      entry(`B24031500043${index}`, ['WATER'])
    );
    const plan = planDay(entries, roster, { date: '2024-03-15' });
    expect(plan.fits).toBe(false);
    const skill = plan.shortfalls.find((entry) => entry.kind === 'skill');
    expect(skill.name).toBe('WATER');
    expect(skill.short).toBe(2);
  });

  it('lets a locator with no district cover any of them', () => {
    const entries = Array.from({ length: 3 }, (unused, index) =>
      entry(`B24031500044${index}`, ['WATER'], ['NORTH'])
    );
    expect(planDay(entries, roster, { date: '2024-03-15' }).fits).toBe(true);
  });

  it('takes the date off the tickets when it was not given', () => {
    expect(planDay([entry('B240315000420')], roster).date).toBe('2024-03-15');
    expect(planDay([], roster).date).toBeNull();
  });

  it('sorts the worst shortfall first', () => {
    const entries = [
      ...Array.from({ length: 8 }, (unused, index) => entry(`B24031500045${index}`, ['WATER'])),
      ...Array.from({ length: 8 }, (unused, index) => entry(`B24031500046${index}`, ['GAS'])),
    ];
    const plan = planDay(entries, roster, { date: '2024-03-15' });
    expect(plan.shortfalls[0].short).toBeGreaterThanOrEqual(plan.shortfalls[1].short);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(planDay([entry('B240315000420')], roster))).toBe(true);
  });
});

describe('whoIsFree', () => {
  it('lists who could take more, emptiest first', () => {
    const free = whoIsFree(roster, { type: 'gas', district: 'CENTRAL', date: '2024-03-15' });
    expect(free.map((entry) => entry.locatorId)).toEqual(['LOC-1', 'LOC-2']);
    expect(free[0].free).toBe(4);
  });

  it('drops anybody already full', () => {
    const assignments = Array.from({ length: 4 }, (unused, index) =>
      buildAssignment({
        number: `B${index}`,
        locatorId: 'loc-1',
        at: '2024-03-15T08:00',
        by: 'd',
      })
    );
    const free = whoIsFree(roster, {
      type: 'gas',
      district: 'CENTRAL',
      assignments,
      date: '2024-03-15',
    });
    expect(free.map((entry) => entry.locatorId)).toEqual(['LOC-2']);
  });

  it('lists everybody when no skill was asked for', () => {
    expect(whoIsFree(roster, { date: '2024-03-15' })).toHaveLength(3);
  });
});

describe('shortfallLines', () => {
  it('says so when the day fits', () => {
    expect(shortfallLines(planDay([entry('B240315000420')], roster))).toEqual(['the day fits']);
  });

  it('writes a line per shortfall', () => {
    const entries = Array.from({ length: 5 }, (unused, index) =>
      entry(`B24031500047${index}`, ['WATER'])
    );
    const lines = shortfallLines(planDay(entries, roster, { date: '2024-03-15' }));
    expect(lines[0]).toMatch(/^2 short on WATER, 5 needed and 3 available$/);
  });
});
