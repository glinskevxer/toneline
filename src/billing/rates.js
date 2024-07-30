/**
 * The locating contract.
 *
 * Most operators buy locating rather than doing it in house, and the contract
 * prices a ticket by its type with premiums bolted on for the awkward ones. The
 * schedule here is the whole price list, and it is deliberately data so a new
 * contract year is a configuration change and not a code change.
 */

import { TonelineError } from '../core/errors.js';
import { deepFreeze, requireNonNegative } from '../core/fields.js';
import { TICKET_TYPE_CODES, ticketType } from '../ticket/types.js';

/** Raised when a rate schedule cannot be used. */
export class BillingError extends TonelineError {
  constructor(message, details = {}) {
    super('BILLING_INVALID', message, details);
  }
}

/** The schedule a desk falls back on when the contract says nothing. */
export const DEFAULT_RATES = Object.freeze({
  unitByType: Object.freeze({
    NORMAL: 12.5,
    SHORT: 18,
    EMERGENCY: 45,
    SECOND: 22,
    MEET: 65,
    DESIGN: 120,
    UPDATE: 9,
    DAMAGE: 0,
    CANCEL: 0,
  }),
  afterHoursPremium: 0.5,
  weekendPremium: 0.75,
  perFootOverBase: 0.12,
  baseFootage: 500,
  minimumMonthly: 0,
});

/** Build a rate schedule, checking every number in it. */
export function buildRates(overrides = {}) {
  const unitByType = { ...DEFAULT_RATES.unitByType, ...(overrides.unitByType ?? {}) };
  for (const [type, rate] of Object.entries(unitByType)) {
    if (!TICKET_TYPE_CODES.includes(type)) {
      throw new BillingError('the schedule prices a ticket type that does not exist', {
        type,
        known: TICKET_TYPE_CODES,
      });
    }
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
      throw new BillingError('a unit rate must be a number at or above zero', { type, rate });
    }
  }
  const schedule = { ...DEFAULT_RATES, ...overrides, unitByType };
  for (const key of [
    'afterHoursPremium',
    'weekendPremium',
    'perFootOverBase',
    'baseFootage',
    'minimumMonthly',
  ]) {
    requireNonNegative(schedule[key], key);
  }
  return deepFreeze(schedule);
}

/** The unit rate for a ticket type. */
export function unitRate(schedule, type) {
  const code = ticketType(type).code;
  const rate = schedule.unitByType[code];
  if (rate === undefined) {
    throw new BillingError('the schedule has no rate for that ticket type', { type: code });
  }
  return rate;
}

/**
 * The premium multiplier that applies to one ticket.
 *
 * Weekend beats after hours rather than stacking on top of it, because the
 * contract prices a Saturday call once however late in the day it came.
 */
export function premiumFor(schedule, { weekend = false, afterHours = false } = {}) {
  if (weekend) return 1 + schedule.weekendPremium;
  if (afterHours) return 1 + schedule.afterHoursPremium;
  return 1;
}

/** What one ticket is worth, before any period minimum. */
export function priceTicket(schedule, { type, footage = 0, weekend = false, afterHours = false }) {
  const base = unitRate(schedule, type);
  const overBase = Math.max(0, footage - schedule.baseFootage);
  const footageCharge = overBase * schedule.perFootOverBase;
  const multiplier = premiumFor(schedule, { weekend, afterHours });
  const amount = (base + footageCharge) * multiplier;
  return deepFreeze({
    type: ticketType(type).code,
    base,
    footageCharge,
    multiplier,
    amount: Math.round(amount * 100) / 100,
  });
}

/** Every ticket type the schedule prices above zero. */
export function chargeableTypes(schedule) {
  return Object.entries(schedule.unitByType)
    .filter(([, rate]) => rate > 0)
    .map(([type]) => type)
    .sort();
}
