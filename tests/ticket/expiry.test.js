import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIFE_POLICY,
  lifePolicy,
  lifeDaysFor,
  computedExpiry,
  effectiveExpiry,
  isExpiredOn,
  daysRemaining,
  markExpiry,
  renewalWindow,
  canRenewOn,
  renewalRefusal,
} from '../../src/ticket/expiry.js';
import { buildTicket } from '../../src/ticket/record.js';
import { Calendar } from '../../src/time/calendar.js';
import { ScheduleError } from '../../src/core/errors.js';

const calendar = new Calendar();

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

describe('lifePolicy', () => {
  it('ships sensible defaults', () => {
    expect(DEFAULT_LIFE_POLICY.defaultLifeDays).toBe(21);
    expect(Object.isFrozen(DEFAULT_LIFE_POLICY)).toBe(true);
  });

  it('merges an override without losing the rest', () => {
    const policy = lifePolicy({ markLifeDays: 10, lifeDaysByType: { EMERGENCY: 5 } });
    expect(policy.markLifeDays).toBe(10);
    expect(policy.defaultLifeDays).toBe(21);
    expect(policy.lifeDaysByType.EMERGENCY).toBe(5);
    expect(policy.lifeDaysByType.DESIGN).toBe(90);
  });

  it('rejects a value that is not a whole day', () => {
    expect(() => lifePolicy({ markLifeDays: 0 })).toThrow(ScheduleError);
    expect(() => lifePolicy({ renewalWindowDays: 1.5 })).toThrow(/whole days/);
  });
});

describe('lifeDaysFor', () => {
  it('reads the type first and falls back to the default', () => {
    expect(lifeDaysFor('EMERGENCY')).toBe(10);
    expect(lifeDaysFor('NORMAL')).toBe(21);
    expect(lifeDaysFor('SECOND')).toBe(21);
  });
});

describe('expiry', () => {
  it('counts the life from the lawful start', () => {
    expect(computedExpiry(ticket(), { calendar })).toBe('2024-04-04');
  });

  it('gives a design request a longer life', () => {
    expect(computedExpiry(ticket({ type: 'DESIGN' }), { calendar })).toBe('2024-06-24');
  });

  it('prefers the date the centre printed', () => {
    expect(effectiveExpiry(ticket({ expiresOn: '2024-04-08' }), { calendar })).toBe('2024-04-08');
    expect(effectiveExpiry(ticket(), { calendar })).toBe('2024-04-04');
  });

  it('says when a ticket has run out', () => {
    const held = ticket();
    expect(isExpiredOn(held, '2024-04-04', { calendar })).toBe(false);
    expect(isExpiredOn(held, '2024-04-05', { calendar })).toBe(true);
  });

  it('counts the days left', () => {
    expect(daysRemaining(ticket(), '2024-04-01', { calendar })).toBe(3);
    expect(daysRemaining(ticket(), '2024-04-04', { calendar })).toBe(0);
    expect(daysRemaining(ticket(), '2024-04-07', { calendar })).toBe(-3);
  });

  it('honours a shortened life policy', () => {
    const policy = lifePolicy({ defaultLifeDays: 7 });
    expect(computedExpiry(ticket(), { calendar, policy })).toBe('2024-03-21');
  });
});

describe('markExpiry', () => {
  it('runs from the day the site was marked', () => {
    expect(markExpiry(ticket(), '2024-03-15T09:00')).toBe('2024-03-28');
  });

  it('honours a shorter mark life', () => {
    expect(
      markExpiry(ticket(), '2024-03-15T09:00', { policy: lifePolicy({ markLifeDays: 7 }) })
    ).toBe('2024-03-21');
  });
});

describe('renewal', () => {
  const held = ticket();

  it('opens the window three days before expiry', () => {
    expect(renewalWindow(held, { calendar })).toEqual({
      opens: '2024-04-02',
      closes: '2024-04-04',
    });
  });

  it('accepts a renewal inside the window', () => {
    expect(canRenewOn(held, '2024-04-02', { calendar })).toBe(true);
    expect(canRenewOn(held, '2024-04-04', { calendar })).toBe(true);
  });

  it('refuses one outside it', () => {
    expect(canRenewOn(held, '2024-04-01', { calendar })).toBe(false);
    expect(canRenewOn(held, '2024-04-05', { calendar })).toBe(false);
  });

  it('says why a renewal was refused', () => {
    expect(renewalRefusal(held, '2024-04-03', { calendar })).toBeNull();
    expect(renewalRefusal(held, '2024-04-01', { calendar })).toBe('too early');
    expect(renewalRefusal(held, '2024-04-05', { calendar })).toBe('expired');
  });

  it('honours a wider window', () => {
    const policy = lifePolicy({ renewalWindowDays: 7 });
    expect(renewalWindow(held, { calendar, policy }).opens).toBe('2024-03-29');
  });
});
