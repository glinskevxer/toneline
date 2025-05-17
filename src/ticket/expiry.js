/**
 * Ticket life, marks and renewal.
 *
 * A ticket is good for a stated run of calendar days from its lawful start.
 * Paint and flags do not last that long, so there is a second and shorter clock
 * on the marks themselves, and an excavator still working when either runs out
 * has to ask for the site to be marked again.
 */

import { definePolicy, wholeFromOne } from '../config/policies.js';
import { addDays, compareDates, daysBetween } from '../time/date.js';
import { dateOf } from '../time/stamp.js';
import { effectiveLawfulStart, expiryFrom } from './lawfulStart.js';

/** The life policy this desk works to, with the defaults it ships with. */
export const DEFAULT_LIFE_POLICY = Object.freeze({
  defaultLifeDays: 21,
  lifeDaysByType: Object.freeze({
    EMERGENCY: 10,
    SHORT: 14,
    DESIGN: 90,
    MEET: 21,
  }),
  markLifeDays: 14,
  renewalWindowDays: 3,
});

/** Merge a partial policy over the defaults. */
export const lifePolicy = definePolicy(
  DEFAULT_LIFE_POLICY,
  {
    defaultLifeDays: wholeFromOne,
    markLifeDays: wholeFromOne,
    renewalWindowDays: wholeFromOne,
  },
  { nested: ['lifeDaysByType'] }
);

/** How many calendar days a ticket of this type is good for. */
export function lifeDaysFor(type, policy = DEFAULT_LIFE_POLICY) {
  return policy.lifeDaysByType[type] ?? policy.defaultLifeDays;
}

/** The date a ticket runs out, worked out rather than taken from the centre. */
export function computedExpiry(ticket, options = {}) {
  const { policy = DEFAULT_LIFE_POLICY, ...startOptions } = options;
  const start = effectiveLawfulStart(ticket, startOptions);
  return expiryFrom(start, lifeDaysFor(ticket.type, policy));
}

/** The expiry the desk works to, preferring the centre's own when it is there. */
export function effectiveExpiry(ticket, options = {}) {
  return ticket.expiresOn ?? computedExpiry(ticket, options);
}

/** True when the ticket has run out by the end of that date. */
export function isExpiredOn(ticket, date, options = {}) {
  return compareDates(date, effectiveExpiry(ticket, options)) > 0;
}

/** Calendar days left, negative once the ticket has run out. */
export function daysRemaining(ticket, date, options = {}) {
  return daysBetween(date, effectiveExpiry(ticket, options));
}

/** The date the marks on the ground stop being trusted. */
export function markExpiry(ticket, markedOn, options = {}) {
  const { policy = DEFAULT_LIFE_POLICY } = options;
  return addDays(dateOf(markedOn), policy.markLifeDays - 1);
}

/** The window during which a renewal may be asked for. */
export function renewalWindow(ticket, options = {}) {
  const { policy = DEFAULT_LIFE_POLICY } = options;
  const expires = effectiveExpiry(ticket, options);
  return { opens: addDays(expires, -(policy.renewalWindowDays - 1)), closes: expires };
}

/** True when a renewal asked for on that date would be in time. */
export function canRenewOn(ticket, date, options = {}) {
  const window = renewalWindow(ticket, options);
  return compareDates(date, window.opens) >= 0 && compareDates(date, window.closes) <= 0;
}

/**
 * Why a ticket cannot be renewed, or null when it can.
 *
 * A ticket type that is not extendable can never be renewed, and one asked for
 * outside the window is either too early or already gone.
 */
export function renewalRefusal(ticket, date, options = {}) {
  const window = renewalWindow(ticket, options);
  if (compareDates(date, window.closes) > 0) return 'expired';
  if (compareDates(date, window.opens) < 0) return 'too early';
  return null;
}
