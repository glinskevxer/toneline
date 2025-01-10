import { describe, expect, it } from 'vitest';
import {
  REASSIGN_REASONS,
  currentHolder,
  handoverCount,
  reassign,
  coverFor,
} from '../../src/dispatch/reassign.js';
import { DispatchError, buildAssignment } from '../../src/dispatch/assign.js';
import { buildRoster } from '../../src/dispatch/locator.js';

const roster = buildRoster([
  { id: 'loc-1', skills: ['gas', 'electric'], districts: ['central'], dailyCapacity: 4 },
  { id: 'loc-2', skills: ['gas'], districts: ['central'], dailyCapacity: 4 },
  { id: 'loc-3', skills: ['gas', 'electric', 'water'], dailyCapacity: 4 },
]);

function assignment(overrides = {}) {
  return buildAssignment({
    number: 'B240315000420',
    locatorId: 'loc-1',
    at: '2024-03-15T08:00',
    by: 'dispatch',
    district: 'CENTRAL',
    types: ['GAS'],
    ...overrides,
  });
}

const BASE = {
  roster,
  types: ['GAS'],
  district: 'CENTRAL',
  at: '2024-03-15T10:00',
  by: 'dispatch',
  reason: 'ABSENT',
};

describe('currentHolder and handoverCount', () => {
  it('finds who has it now', () => {
    const held = [assignment(), assignment({ locatorId: 'loc-2', at: '2024-03-15T09:00' })];
    expect(currentHolder(held, 'b240315000420').locatorId).toBe('LOC-2');
  });

  it('finds nobody for a ticket never handed out', () => {
    expect(currentHolder([], 'B240315000420')).toBeNull();
  });

  it('counts the handovers, not the assignments', () => {
    expect(handoverCount([assignment()], 'B240315000420')).toBe(0);
    expect(handoverCount([assignment(), assignment({ locatorId: 'loc-2' })], 'B240315000420')).toBe(
      1
    );
  });
});

describe('reassign', () => {
  it('moves the ticket to somebody else', () => {
    const result = reassign({ ...BASE, number: 'B240315000420', assignments: [assignment()] });
    expect(result.from).toBe('LOC-1');
    expect(result.assignment.locatorId).toBe('LOC-2');
    expect(result.assignment.note).toBe('moved from LOC-1: absent');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('carries the deadline and the district over', () => {
    const held = assignment({ dueAt: '2024-03-19T07:42' });
    const result = reassign({ ...BASE, number: 'B240315000420', assignments: [held] });
    expect(result.assignment.dueAt).toBe('2024-03-19T07:42');
    expect(result.assignment.district).toBe('CENTRAL');
  });

  it('moves to the locator asked for', () => {
    const result = reassign({
      ...BASE,
      number: 'B240315000420',
      assignments: [assignment()],
      to: 'loc-3',
    });
    expect(result.assignment.locatorId).toBe('LOC-3');
  });

  it('refuses a locator who cannot take it', () => {
    expect(() =>
      reassign({
        ...BASE,
        number: 'B240315000420',
        assignments: [assignment()],
        to: 'loc-9',
      })
    ).toThrow(/cannot take the ticket/);
  });

  it('refuses a ticket nobody holds', () => {
    expect(() => reassign({ ...BASE, number: 'B240315000420', assignments: [] })).toThrow(
      /not been handed out/
    );
  });

  it('refuses a reason it does not move work for', () => {
    try {
      reassign({ ...BASE, number: 'B240315000420', assignments: [assignment()], reason: 'bored' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.known).toEqual(REASSIGN_REASONS);
    }
  });

  it('refuses a bad timestamp', () => {
    expect(() =>
      reassign({ ...BASE, number: 'B240315000420', assignments: [assignment()], at: '2024-03-15' })
    ).toThrow(DispatchError);
  });

  it('refuses once the ticket has been passed around enough', () => {
    const held = [
      assignment(),
      assignment({ locatorId: 'loc-2', at: '2024-03-15T09:00' }),
      assignment({ locatorId: 'loc-3', at: '2024-03-15T09:30' }),
    ];
    expect(() => reassign({ ...BASE, number: 'B240315000420', assignments: held })).toThrow(
      /passed around enough/
    );
  });

  it('refuses when nobody else is qualified', () => {
    expect(() =>
      reassign({
        ...BASE,
        number: 'B240315000420',
        assignments: [assignment()],
        types: ['STEAM'],
      })
    ).toThrow(/nobody else free and qualified/);
  });

  it('refuses a load move that would not lighten anybody', () => {
    expect(() =>
      reassign({
        ...BASE,
        number: 'B240315000420',
        assignments: [assignment()],
        reason: 'OVERLOADED',
      })
    ).toThrow(/would not lighten anybody/);
  });

  it('allows a load move that does lighten somebody', () => {
    const held = [
      assignment(),
      assignment({ number: 'B240315000421' }),
      assignment({ number: 'B240315000422' }),
    ];
    const result = reassign({
      ...BASE,
      number: 'B240315000420',
      assignments: held,
      reason: 'OVERLOADED',
    });
    expect(result.assignment.locatorId).toBe('LOC-2');
  });
});

describe('coverFor', () => {
  it('moves everything the locator holds today', () => {
    const held = [assignment(), assignment({ number: 'B240315000421' })];
    const { moved, stuck } = coverFor('loc-1', { ...BASE, assignments: held });
    expect(moved).toHaveLength(2);
    expect(stuck).toEqual([]);
    expect(new Set(moved.map((entry) => entry.assignment.locatorId)).size).toBeGreaterThan(0);
  });

  it('leaves another day alone', () => {
    const held = [assignment({ at: '2024-03-14T08:00' })];
    expect(coverFor('loc-1', { ...BASE, assignments: held }).moved).toEqual([]);
  });

  it('records what it could not move', () => {
    const held = [assignment({ types: ['STEAM'] })];
    const { moved, stuck } = coverFor('loc-1', { ...BASE, assignments: held });
    expect(moved).toEqual([]);
    expect(stuck[0].reason).toMatch(/nobody else free and qualified/);
  });

  it('covers nothing for a locator holding nothing', () => {
    expect(coverFor('loc-9', { ...BASE, assignments: [assignment()] }).moved).toEqual([]);
  });
});
