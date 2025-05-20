/**
 * Closing a period.
 *
 * A month that has been invoiced and paid should not quietly change because a
 * late posting arrived. Closing a period records what it was closed with, and
 * anything landing afterwards goes to the next open period instead, with the
 * fact that it was late kept rather than hidden.
 */

import { deepFreeze, normaliseCode, requireString } from '../core/fields.js';
import { addDays, compareDates } from '../time/date.js';
import { dateOf } from '../time/stamp.js';
import { BillingError } from './rates.js';

const MONTH = /^\d{4}-\d{2}$/;

/** The states a period moves through. */
export const PERIOD_STATES = Object.freeze(['open', 'closed', 'locked']);

/** Check a period label and hand it back. */
export function periodOf(value) {
  const period = requireString(value, 'period');
  if (!MONTH.test(period)) {
    throw new BillingError('a period must be a month in YYYY-MM form', { period });
  }
  return period;
}

/** The month after this one. */
export function nextPeriod(period) {
  const [year, month] = periodOf(period).split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** The month a date falls in. */
export function periodFor(date) {
  return dateOf(date).slice(0, 7);
}

/** Build a close record. */
export function closePeriod({ period, closedOn, closedBy, invoice, credits = null }) {
  const month = periodOf(period);
  const on = requireString(closedOn, 'closedOn');
  const lastDay = lastDayOf(month);
  if (compareDates(on, lastDay) < 0) {
    throw new BillingError('a period cannot be closed before it has finished', {
      period: month,
      closedOn: on,
    });
  }
  return deepFreeze({
    period: month,
    state: 'closed',
    closedOn: on,
    closedBy: requireString(closedBy, 'closedBy'),
    tickets: invoice.lines.length,
    invoiced: invoice.total,
    credited: credits === null ? 0 : credits.applied,
    payable: credits === null ? invoice.total : credits.payable,
  });
}

function lastDayOf(period) {
  const [year, month] = period.split('-').map(Number);
  const firstOfNext =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return addDays(firstOfNext, -1);
}

/** Lock a closed period so nothing can reopen it. */
export function lockPeriod(closed, { lockedOn, lockedBy }) {
  if (closed.state !== 'closed') {
    throw new BillingError('only a closed period can be locked', {
      period: closed.period,
      state: closed.state,
    });
  }
  return deepFreeze({
    ...closed,
    state: 'locked',
    lockedOn: requireString(lockedOn, 'lockedOn'),
    lockedBy: requireString(lockedBy, 'lockedBy'),
  });
}

/** The state a period is in, given what has been closed. */
export function stateOf(closures, period) {
  const month = periodOf(period);
  const found = closures.find((closure) => closure.period === month);
  return found === undefined ? 'open' : found.state;
}

/**
 * Where a posting should be billed, given what is closed.
 *
 * A posting for a closed month moves forward to the first open one and is
 * marked late, so the invoice for that month shows why it carries work from
 * before it.
 */
export function billingPeriodFor(response, closures) {
  const natural = periodFor(response.at);
  let period = natural;
  for (let guard = 0; guard < 60; guard += 1) {
    if (stateOf(closures, period) === 'open') {
      return { period, late: period !== natural, from: natural };
    }
    period = nextPeriod(period);
  }
  throw new BillingError('every period ahead of this one is closed', { from: natural });
}

/** True when a period may still be invoiced. */
export function isOpen(closures, period) {
  return stateOf(closures, period) === 'open';
}

/** The closed periods, most recent first. */
export function closedPeriods(closures) {
  return [...closures]
    .filter((closure) => closure.state !== 'open')
    .sort((left, right) => right.period.localeCompare(left.period));
}

/** Normalise a state the way the rest of the library normalises codes. */
export function periodState(value) {
  const state = normaliseCode(value).toLowerCase();
  if (!PERIOD_STATES.includes(state)) {
    throw new BillingError('that is not a period state', { value, known: PERIOD_STATES });
  }
  return state;
}
