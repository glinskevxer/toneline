/**
 * Lawful start.
 *
 * An excavator may not break ground until the waiting period on the ticket has
 * run. The period is counted in full business days, which means the day the
 * call was taken never counts, and a call taken after the centre's cutoff does
 * not even start the count until the following business day.
 */

import { ScheduleError } from '../core/errors.js';
import { Calendar } from '../time/calendar.js';
import { addDays } from '../time/date.js';
import {
  atTime,
  compareStamps,
  dateOf,
  parseClockTime,
  parseStamp,
  timeOf,
} from '../time/stamp.js';
import { ticketType } from './types.js';

const DEFAULT_CUTOFF = '17:00';

/**
 * Work out when digging may lawfully start.
 *
 * @param {object} args
 * @param {string} args.takenAt when the centre took the call
 * @param {string} args.type ticket type code
 * @param {Calendar} [args.calendar] business day calendar
 * @param {string} [args.cutoff] the centre's daily cutoff time
 * @returns {string} the first minute digging is lawful
 */
export function lawfulStartFrom({
  takenAt,
  type,
  calendar = new Calendar(),
  cutoff = DEFAULT_CUTOFF,
}) {
  if (!(calendar instanceof Calendar)) {
    throw new ScheduleError('lawful start needs a Calendar instance', {});
  }
  const definition = ticketType(type);
  const taken = parseStamp(takenAt);
  if (definition.waitBusinessDays === 0) return takenAt;

  const cutoffMinute = parseClockTime(cutoff);
  const countFrom =
    taken.minuteOfDay >= cutoffMinute || !calendar.isBusinessDay(taken.date)
      ? calendar.nextBusinessDay(taken.date)
      : taken.date;
  const startDate = calendar.addBusinessDays(countFrom, definition.waitBusinessDays);
  return atTime(startDate, timeOf(takenAt));
}

/** Work out when digging may lawfully start on a ticket. */
export function lawfulStartFor(ticket, options = {}) {
  return lawfulStartFrom({ takenAt: ticket.takenAt, type: ticket.type, ...options });
}

/**
 * The lawful start a ticket should carry, preferring the centre's own value
 * when it is there and no later than the one this desk works out.
 */
export function effectiveLawfulStart(ticket, options = {}) {
  const computed = lawfulStartFor(ticket, options);
  if (ticket.lawfulStartAt === null) return computed;
  return compareStamps(ticket.lawfulStartAt, computed) >= 0 ? ticket.lawfulStartAt : computed;
}

/** True when the centre's stated lawful start disagrees with the rules. */
export function lawfulStartDisagrees(ticket, options = {}) {
  if (ticket.lawfulStartAt === null) return false;
  return compareStamps(ticket.lawfulStartAt, lawfulStartFor(ticket, options)) !== 0;
}

/** True when digging at that moment would be lawful. */
export function mayDigAt(ticket, at, options = {}) {
  return compareStamps(at, effectiveLawfulStart(ticket, options)) >= 0;
}

/** Whole hours of notice the excavator gave before the lawful start. */
export function noticeHours(ticket, options = {}) {
  const start = effectiveLawfulStart(ticket, options);
  const minutes = Math.max(0, minutesApart(ticket.takenAt, start));
  return Math.floor(minutes / 60);
}

function minutesApart(from, to) {
  const a = parseStamp(from);
  const b = parseStamp(to);
  const days = Math.round(
    (Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${a.date}T00:00:00Z`)) / 86400000
  );
  return days * 1440 + (b.minuteOfDay - a.minuteOfDay);
}

/**
 * The date the ticket runs out.
 *
 * A ticket is good for a fixed number of calendar days from the lawful start,
 * and an excavator still working on the last day has to renew it.
 */
export function expiryFrom(lawfulStart, lifeDays) {
  if (!Number.isInteger(lifeDays) || lifeDays < 1) {
    throw new ScheduleError('ticket life must be at least one day', { lifeDays });
  }
  return addDays(dateOf(lawfulStart), lifeDays - 1);
}
