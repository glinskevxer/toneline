/**
 * The monthly locating invoice.
 *
 * A ticket falls into the month its first posting landed in, not the month it
 * was received, because that is the month the work was done. A ticket nobody
 * answered is not billable at all, which is the contract's own way of making
 * sure the desk is not paid for work it did not do.
 */

import { deepFreeze, requireString } from '../core/fields.js';
import { weekday } from '../time/date.js';
import { dateOf, parseClockTime, parseStamp } from '../time/stamp.js';
import { extentFootage } from '../ticket/site.js';
import { sortResponses } from '../response/post.js';
import { BillingError, buildRates, priceTicket } from './rates.js';

const MONTH = /^\d{4}-\d{2}$/;

/** True when the timestamp falls on a weekend day. */
export function isWeekendStamp(stamp) {
  const day = weekday(dateOf(stamp));
  return day === 0 || day === 6;
}

/** True when the timestamp falls outside the contracted day. */
export function isAfterHours(stamp, { dayStart = '07:00', dayEnd = '17:00' } = {}) {
  const { minuteOfDay } = parseStamp(stamp);
  return minuteOfDay < parseClockTime(dayStart) || minuteOfDay >= parseClockTime(dayEnd);
}

/** The month a ticket falls into, or null when it was never answered. */
export function billingMonth(ticket, responses) {
  const mine = sortResponses(responses.filter((response) => response.number === ticket.number));
  return mine.length === 0 ? null : dateOf(mine[0].at).slice(0, 7);
}

/**
 * Build one invoice line.
 *
 * @param {object} ticket
 * @param {string} postedAt when the first posting landed
 * @param {object} schedule the rate schedule
 * @param {object} [options] contracted day
 */
export function invoiceLine(ticket, postedAt, schedule, options = {}) {
  const footage = extentFootage(ticket.extent) ?? 0;
  const weekend = isWeekendStamp(postedAt);
  const afterHours = isAfterHours(postedAt, options);
  const priced = priceTicket(schedule, { type: ticket.type, footage, weekend, afterHours });
  return deepFreeze({
    number: ticket.number,
    type: priced.type,
    postedAt,
    footage,
    weekend,
    afterHours,
    base: priced.base,
    footageCharge: Math.round(priced.footageCharge * 100) / 100,
    multiplier: priced.multiplier,
    amount: priced.amount,
  });
}

/**
 * Build a whole month's invoice.
 *
 * @param {object} args
 * @param {string} args.period the month as `YYYY-MM`
 * @param {object[]} args.tickets the tickets to consider
 * @param {object[]} args.responses every posting the desk made
 * @param {object} [args.rates] the rate schedule
 * @param {object} [args.day] the contracted day, as `dayStart` and `dayEnd`
 */
export function buildInvoice({ period, tickets, responses, rates, day = {} }) {
  const month = requireString(period, 'period');
  if (!MONTH.test(month)) {
    throw new BillingError('an invoice period must be a month in YYYY-MM form', { period });
  }
  const schedule = rates ?? buildRates();
  const lines = [];
  const skipped = [];
  for (const ticket of tickets) {
    const mine = sortResponses(responses.filter((response) => response.number === ticket.number));
    if (mine.length === 0) {
      skipped.push({ number: ticket.number, reason: 'never answered' });
      continue;
    }
    const postedAt = mine[0].at;
    if (dateOf(postedAt).slice(0, 7) !== month) {
      skipped.push({ number: ticket.number, reason: 'answered in another month' });
      continue;
    }
    lines.push(invoiceLine(ticket, postedAt, schedule, day));
  }
  lines.sort(
    (left, right) =>
      left.postedAt.localeCompare(right.postedAt) || left.number.localeCompare(right.number)
  );
  const subtotal = round(lines.reduce((sum, line) => sum + line.amount, 0));
  const topUp = round(Math.max(0, schedule.minimumMonthly - subtotal));
  return deepFreeze({
    period: month,
    lines,
    skipped,
    tickets: lines.length,
    subtotal,
    minimumTopUp: topUp,
    total: round(subtotal + topUp),
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** The invoice total split by ticket type. */
export function invoiceByType(invoice) {
  const totals = {};
  for (const line of invoice.lines) {
    totals[line.type] = round((totals[line.type] ?? 0) + line.amount);
  }
  return totals;
}

/** The lines that carried a premium, which is what a reviewer looks at first. */
export function premiumLines(invoice) {
  return invoice.lines.filter((line) => line.multiplier > 1);
}
