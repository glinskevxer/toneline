import { describe, expect, it } from 'vitest';
import {
  damageRate,
  countBy,
  monthOf,
  damageSummary,
  monthlySeries,
  topCounts,
  comparePeriods,
} from '../../src/damage/stats.js';
import { buildDamage } from '../../src/damage/report.js';

function damage(overrides = {}) {
  return buildDamage({
    id: 'dmg-1',
    at: '2024-03-19T10:25',
    ticketNumber: 'B240315000420',
    facilityType: 'gas',
    method: 'backhoe',
    marksPresent: 'Y',
    marksAccurate: 'Y',
    ticketValid: 'Y',
    reportedBy: 'loc-14',
    ...overrides,
  });
}

const DAMAGES = [
  damage({ id: 'd1' }),
  damage({ id: 'd2', ticketNumber: null, method: 'trencher' }),
  damage({
    id: 'd3',
    at: '2024-04-02T08:00',
    facilityType: 'water',
    marksPresent: 'N',
    marksAccurate: 'N',
    serviceInterrupted: 'Y',
    customersOut: 4,
  }),
];

describe('damageRate', () => {
  it('counts per thousand tickets', () => {
    expect(damageRate(3, 1500)).toBe(2);
    expect(damageRate(0, 1500)).toBe(0);
  });

  it('is zero rather than infinite with no tickets', () => {
    expect(damageRate(3, 0)).toBe(0);
    expect(damageRate(3, -1)).toBe(0);
  });

  it('rejects a nonsense damage count', () => {
    expect(() => damageRate(-1, 100)).toThrow(TypeError);
    expect(() => damageRate(Number.NaN, 100)).toThrow(/at or above zero/);
  });
});

describe('countBy and monthOf', () => {
  it('counts by any key', () => {
    expect(countBy(DAMAGES, (damage) => damage.facilityType)).toEqual({ GAS: 2, WATER: 1 });
  });

  it('counts nothing from nothing', () => {
    expect(countBy([], (damage) => damage.method)).toEqual({});
  });

  it('reads the month', () => {
    expect(monthOf(DAMAGES[0])).toBe('2024-03');
    expect(monthOf(DAMAGES[2])).toBe('2024-04');
  });
});

describe('damageSummary', () => {
  const summary = damageSummary(DAMAGES, { tickets: 1500 });

  it('counts the damages and the rate', () => {
    expect(summary.damages).toBe(3);
    expect(summary.tickets).toBe(1500);
    expect(summary.ratePerThousand).toBe(2);
  });

  it('splits by cause, facility, method and month', () => {
    expect(summary.byCause).toEqual({ EXCAVATION: 1, NOTIFICATION: 1, LOCATING: 1 });
    expect(summary.byFacility).toEqual({ GAS: 2, WATER: 1 });
    expect(summary.byMethod).toEqual({ BACKHOE: 2, TRENCHER: 1 });
    expect(summary.byMonth).toEqual({ '2024-03': 2, '2024-04': 1 });
  });

  it('counts the outages and who was off supply', () => {
    expect(summary.withOutage).toBe(1);
    expect(summary.customersOut).toBe(4);
    expect(summary.injuries).toBe(0);
  });

  it('counts the reportable ones', () => {
    expect(summary.reportable).toBe(3);
  });

  it('summarises nothing without dividing by zero', () => {
    const empty = damageSummary([]);
    expect(empty.damages).toBe(0);
    expect(empty.ratePerThousand).toBe(0);
    expect(empty.byCause).toEqual({});
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(summary)).toBe(true);
  });
});

describe('monthlySeries and topCounts', () => {
  const summary = damageSummary(DAMAGES, { tickets: 1500 });

  it('puts the months in order', () => {
    expect(monthlySeries(summary)).toEqual([
      { month: '2024-03', damages: 2 },
      { month: '2024-04', damages: 1 },
    ]);
  });

  it('ranks a count map', () => {
    expect(topCounts(summary.byFacility)).toEqual([
      { key: 'GAS', count: 2 },
      { key: 'WATER', count: 1 },
    ]);
  });

  it('honours the limit and breaks ties by key', () => {
    expect(topCounts({ B: 1, A: 1, C: 3 }, 2)).toEqual([
      { key: 'C', count: 3 },
      { key: 'A', count: 1 },
    ]);
  });
});

describe('comparePeriods', () => {
  it('reports an improvement', () => {
    const before = damageSummary(DAMAGES, { tickets: 1000 });
    const after = damageSummary(DAMAGES.slice(0, 1), { tickets: 1000 });
    const compared = comparePeriods(before, after);
    expect(compared.damageChange).toBe(-2);
    expect(compared.rateChange).toBe(-2);
    expect(compared.improved).toBe(true);
  });

  it('reports a worsening', () => {
    const before = damageSummary(DAMAGES.slice(0, 1), { tickets: 1000 });
    const after = damageSummary(DAMAGES, { tickets: 1000 });
    expect(comparePeriods(before, after).improved).toBe(false);
  });

  it('has no rate to compare when either period handled nothing', () => {
    const before = damageSummary(DAMAGES);
    const after = damageSummary(DAMAGES, { tickets: 1000 });
    const compared = comparePeriods(before, after);
    expect(compared.rateChange).toBeNull();
    expect(compared.improved).toBeNull();
  });
});
