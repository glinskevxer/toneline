import { describe, expect, it } from 'vitest';
import {
  DispatchError,
  buildAssignment,
  loadOn,
  candidatesFor,
  assignTicket,
  assignBatch,
  dayList,
} from '../../src/dispatch/assign.js';
import { buildRoster } from '../../src/dispatch/locator.js';
import { buildTicket } from '../../src/ticket/record.js';

const roster = buildRoster([
  { id: 'loc-1', skills: ['gas', 'electric'], districts: ['central'], dailyCapacity: 2 },
  { id: 'loc-2', skills: ['gas'], districts: ['central'], dailyCapacity: 4 },
  { id: 'loc-3', skills: ['gas', 'electric', 'water'], dailyCapacity: 4 },
]);

function ticket(number = 'B240315000420') {
  return buildTicket({
    number,
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
  });
}

function screening(overrides = {}) {
  return {
    ours: true,
    districts: ['CENTRAL'],
    hits: [{ type: 'GAS', insideTolerance: true, abandoned: false }],
    ...overrides,
  };
}

describe('buildAssignment', () => {
  const RAW = {
    number: 'b240315000420',
    locatorId: 'loc-1',
    at: '2024-03-15T08:00',
    by: 'dispatch',
  };

  it('builds a frozen record', () => {
    const assignment = buildAssignment(RAW);
    expect(assignment.number).toBe('B240315000420');
    expect(assignment.locatorId).toBe('LOC-1');
    expect(assignment.district).toBeNull();
    expect(Object.isFrozen(assignment)).toBe(true);
  });

  it('normalises the district and the types', () => {
    const assignment = buildAssignment({ ...RAW, district: 'central', types: ['gas'] });
    expect(assignment.district).toBe('CENTRAL');
    expect(assignment.types).toEqual(['GAS']);
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildAssignment(null)).toThrow(DispatchError);
  });

  it('rejects bad timestamps and missing fields', () => {
    expect(() => buildAssignment({ ...RAW, at: '2024-03-15' })).toThrow(/needs a timestamp/);
    expect(() => buildAssignment({ ...RAW, dueAt: '2024-03-15' })).toThrow(/due time must be/);
    expect(() => buildAssignment({ ...RAW, by: '' })).toThrow(/by is required/);
  });
});

describe('loadOn', () => {
  const assignments = [
    buildAssignment({ number: 'B1', locatorId: 'loc-1', at: '2024-03-15T08:00', by: 'd' }),
    buildAssignment({ number: 'B2', locatorId: 'loc-1', at: '2024-03-15T09:00', by: 'd' }),
    buildAssignment({ number: 'B3', locatorId: 'loc-1', at: '2024-03-16T08:00', by: 'd' }),
    buildAssignment({ number: 'B4', locatorId: 'loc-2', at: '2024-03-15T08:00', by: 'd' }),
  ];

  it('counts one locator on one day', () => {
    expect(loadOn(assignments, 'LOC-1', '2024-03-15')).toBe(2);
    expect(loadOn(assignments, 'loc-1', '2024-03-16')).toBe(1);
    expect(loadOn(assignments, 'loc-9', '2024-03-15')).toBe(0);
  });

  it('lists one locator day in order', () => {
    expect(dayList(assignments, 'loc-1', '2024-03-15').map((a) => a.number)).toEqual(['B1', 'B2']);
  });
});

describe('candidatesFor', () => {
  it('needs every skill and the district', () => {
    const found = candidatesFor(roster, {
      types: ['GAS', 'ELECTRIC'],
      district: 'CENTRAL',
      assignments: [],
      at: '2024-03-15T08:00',
    });
    expect(found.map((entry) => entry.locator.id)).toEqual(['LOC-1', 'LOC-3']);
  });

  it('puts the lightest load first', () => {
    const assignments = [
      buildAssignment({ number: 'B1', locatorId: 'loc-1', at: '2024-03-15T08:00', by: 'd' }),
    ];
    const found = candidatesFor(roster, {
      types: ['GAS'],
      district: 'CENTRAL',
      assignments,
      at: '2024-03-15T08:30',
    });
    expect(found[0].locator.id).toBe('LOC-2');
  });

  it('drops anyone already full', () => {
    const assignments = [
      buildAssignment({ number: 'B1', locatorId: 'loc-1', at: '2024-03-15T08:00', by: 'd' }),
      buildAssignment({ number: 'B2', locatorId: 'loc-1', at: '2024-03-15T09:00', by: 'd' }),
    ];
    const found = candidatesFor(roster, {
      types: ['GAS', 'ELECTRIC'],
      district: 'CENTRAL',
      assignments,
      at: '2024-03-15T10:00',
    });
    expect(found.map((entry) => entry.locator.id)).toEqual(['LOC-3']);
  });

  it('counts only the day it is asked about', () => {
    const assignments = [
      buildAssignment({ number: 'B1', locatorId: 'loc-1', at: '2024-03-14T08:00', by: 'd' }),
      buildAssignment({ number: 'B2', locatorId: 'loc-1', at: '2024-03-14T09:00', by: 'd' }),
    ];
    const found = candidatesFor(roster, {
      types: ['GAS', 'ELECTRIC'],
      district: 'CENTRAL',
      assignments,
      at: '2024-03-15T08:00',
    });
    expect(found[0].locator.id).toBe('LOC-1');
  });
});

describe('assignTicket', () => {
  it('picks a qualified locator and records the work', () => {
    const assignment = assignTicket(ticket(), {
      screening: screening(),
      roster,
      at: '2024-03-15T08:00',
      by: 'dispatch',
      dueAt: '2024-03-19T07:42',
    });
    expect(assignment.locatorId).toBe('LOC-1');
    expect(assignment.types).toEqual(['GAS']);
    expect(assignment.district).toBe('CENTRAL');
    expect(assignment.dueAt).toBe('2024-03-19T07:42');
  });

  it('refuses a ticket that is not ours', () => {
    expect(() =>
      assignTicket(ticket(), {
        screening: screening({ ours: false }),
        roster,
        at: '2024-03-15T08:00',
        by: 'dispatch',
      })
    ).toThrow(/not ours to work/);
  });

  it('refuses when nobody is qualified', () => {
    try {
      assignTicket(ticket(), {
        screening: screening({
          hits: [{ type: 'STEAM', insideTolerance: true, abandoned: false }],
        }),
        roster,
        at: '2024-03-15T08:00',
        by: 'dispatch',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DispatchError);
      expect(err.details.types).toEqual(['STEAM']);
    }
  });

  it('works with no district on the screening', () => {
    const assignment = assignTicket(ticket(), {
      screening: screening({ districts: [] }),
      roster,
      at: '2024-03-15T08:00',
      by: 'dispatch',
    });
    expect(assignment.district).toBeNull();
  });
});

describe('assignBatch', () => {
  it('spreads the work as it goes', () => {
    const pairs = [
      { ticket: ticket('B240315000420'), screening: screening() },
      { ticket: ticket('B240315000421'), screening: screening() },
      { ticket: ticket('B240315000422'), screening: screening() },
    ];
    const { assignments, results } = assignBatch(pairs, {
      roster,
      at: '2024-03-15T08:00',
      by: 'dispatch',
    });
    expect(assignments).toHaveLength(3);
    expect(results.every((entry) => entry.error === null)).toBe(true);
    const chosen = assignments.map((a) => a.locatorId);
    expect(new Set(chosen).size).toBeGreaterThan(1);
  });

  it('collects the ones it could not place', () => {
    const pairs = [
      { ticket: ticket('B240315000420'), screening: screening() },
      {
        ticket: ticket('B240315000421'),
        screening: screening({
          hits: [{ type: 'STEAM', insideTolerance: true, abandoned: false }],
        }),
      },
    ];
    const { assignments, results } = assignBatch(pairs, {
      roster,
      at: '2024-03-15T08:00',
      by: 'dispatch',
    });
    expect(assignments).toHaveLength(1);
    expect(results[1].error).toMatch(/no locator is free/);
  });

  it('counts assignments it was handed without returning them again', () => {
    const existing = [
      buildAssignment({ number: 'B1', locatorId: 'loc-1', at: '2024-03-15T07:00', by: 'd' }),
    ];
    const { assignments } = assignBatch([{ ticket: ticket(), screening: screening() }], {
      roster,
      assignments: existing,
      at: '2024-03-15T08:00',
      by: 'dispatch',
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].locatorId).toBe('LOC-2');
  });
});
