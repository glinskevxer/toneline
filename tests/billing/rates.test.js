import { describe, expect, it } from 'vitest';
import {
  BillingError,
  DEFAULT_RATES,
  buildRates,
  unitRate,
  premiumFor,
  priceTicket,
  chargeableTypes,
} from '../../src/billing/rates.js';

describe('buildRates', () => {
  it('ships a default schedule', () => {
    expect(DEFAULT_RATES.unitByType.NORMAL).toBe(12.5);
    expect(Object.isFrozen(DEFAULT_RATES)).toBe(true);
  });

  it('merges an override without losing the rest', () => {
    const schedule = buildRates({ unitByType: { NORMAL: 14 }, afterHoursPremium: 0.6 });
    expect(schedule.unitByType.NORMAL).toBe(14);
    expect(schedule.unitByType.EMERGENCY).toBe(45);
    expect(schedule.afterHoursPremium).toBe(0.6);
    expect(schedule.weekendPremium).toBe(0.75);
  });

  it('rejects a rate for a type that does not exist', () => {
    try {
      buildRates({ unitByType: { ROUTINE: 10 } });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BillingError);
      expect(err.details.known).toContain('NORMAL');
    }
  });

  it('rejects a rate that is not a number at or above zero', () => {
    expect(() => buildRates({ unitByType: { NORMAL: -1 } })).toThrow(/at or above zero/);
    expect(() => buildRates({ unitByType: { NORMAL: 'ten' } })).toThrow(BillingError);
  });

  it('rejects a bad premium or footage setting', () => {
    expect(() => buildRates({ afterHoursPremium: -0.1 })).toThrow(/cannot be negative/);
    expect(() => buildRates({ baseFootage: 'lots' })).toThrow(/must be a number/);
  });
});

describe('unitRate', () => {
  const schedule = buildRates();

  it('reads the rate for a type in any case', () => {
    expect(unitRate(schedule, 'normal')).toBe(12.5);
    expect(unitRate(schedule, 'EMERGENCY')).toBe(45);
  });

  it('rejects a type that is not one at all', () => {
    expect(() => unitRate(schedule, 'ROUTINE')).toThrow(/not one this desk handles/);
  });

  it('rejects a type the schedule has dropped', () => {
    const partial = buildRates();
    const stripped = { ...partial, unitByType: { NORMAL: 12.5 } };
    expect(() => unitRate(stripped, 'MEET')).toThrow(/no rate for that ticket type/);
  });
});

describe('premiumFor', () => {
  const schedule = buildRates();

  it('is one on an ordinary ticket', () => {
    expect(premiumFor(schedule)).toBe(1);
  });

  it('adds the after hours premium', () => {
    expect(premiumFor(schedule, { afterHours: true })).toBe(1.5);
  });

  it('lets the weekend premium win rather than stacking', () => {
    expect(premiumFor(schedule, { weekend: true })).toBe(1.75);
    expect(premiumFor(schedule, { weekend: true, afterHours: true })).toBe(1.75);
  });
});

describe('priceTicket', () => {
  const schedule = buildRates();

  it('prices a plain ticket at its unit rate', () => {
    const priced = priceTicket(schedule, { type: 'NORMAL' });
    expect(priced.amount).toBe(12.5);
    expect(priced.footageCharge).toBe(0);
    expect(priced.multiplier).toBe(1);
  });

  it('charges nothing extra up to the base footage', () => {
    expect(priceTicket(schedule, { type: 'NORMAL', footage: 500 }).amount).toBe(12.5);
  });

  it('charges for footage over the base', () => {
    const priced = priceTicket(schedule, { type: 'NORMAL', footage: 700 });
    expect(priced.footageCharge).toBeCloseTo(24, 6);
    expect(priced.amount).toBe(36.5);
  });

  it('applies the premium to the footage as well as the unit', () => {
    const priced = priceTicket(schedule, { type: 'NORMAL', footage: 700, weekend: true });
    expect(priced.amount).toBe(63.88);
  });

  it('rounds to the cent', () => {
    const odd = buildRates({ unitByType: { NORMAL: 12.333 } });
    expect(priceTicket(odd, { type: 'NORMAL' }).amount).toBe(12.33);
  });

  it('prices a cancellation at nothing', () => {
    expect(priceTicket(schedule, { type: 'CANCEL' }).amount).toBe(0);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(priceTicket(schedule, { type: 'NORMAL' }))).toBe(true);
  });
});

describe('chargeableTypes', () => {
  it('lists the types worth billing, sorted', () => {
    const types = chargeableTypes(buildRates());
    expect(types).toContain('NORMAL');
    expect(types).not.toContain('CANCEL');
    expect(types).toEqual([...types].sort());
  });
});
