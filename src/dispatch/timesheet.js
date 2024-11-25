/**
 * Locator time.
 *
 * What a locator actually did with the day, which is a different question from
 * what they were assigned. Time is booked against a ticket or against one of a
 * short list of non ticket activities, and the productivity number the contract
 * is measured on is tickets completed per hour on the ground, not per hour paid.
 */

import { deepFreeze, normaliseCode, optionalString, requireString } from '../core/fields.js';
import { compareStamps, dateOf, isStamp, minutesBetween } from '../time/stamp.js';
import { DispatchError } from './assign.js';

/** What a locator can book time against other than a ticket. */
export const NON_TICKET_ACTIVITIES = Object.freeze([
  'TRAVEL',
  'STANDBY',
  'TRAINING',
  'VEHICLE',
  'MEETING',
  'BREAK',
]);

/** Build one time entry. */
export function buildTimeEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DispatchError('a time entry must be built from an object', { type: typeof raw });
  }
  const from = requireString(raw.from, 'from');
  const to = requireString(raw.to, 'to');
  if (!isStamp(from) || !isStamp(to)) {
    throw new DispatchError('a time entry needs two timestamps', { from, to });
  }
  if (compareStamps(to, from) <= 0) {
    throw new DispatchError('a time entry has to end after it starts', { from, to });
  }
  if (dateOf(from) !== dateOf(to)) {
    throw new DispatchError('a time entry cannot cross midnight', { from, to });
  }
  const number = optionalString(raw.number, 'number');
  const activity = number === null ? normaliseCode(raw.activity ?? 'STANDBY') : 'TICKET';
  if (activity !== 'TICKET' && !NON_TICKET_ACTIVITIES.includes(activity)) {
    throw new DispatchError('that is not an activity we book time against', {
      activity,
      known: NON_TICKET_ACTIVITIES,
    });
  }
  return deepFreeze({
    locatorId: requireString(raw.locatorId, 'locatorId').toUpperCase(),
    date: dateOf(from),
    from,
    to,
    minutes: minutesBetween(from, to),
    number: number === null ? null : number.toUpperCase(),
    activity,
    note: optionalString(raw.note, 'note'),
  });
}

/** Every entry for one locator on one day, in order. */
export function dayEntries(entries, locatorId, date) {
  const wanted = normaliseCode(locatorId);
  return entries
    .filter((entry) => entry.locatorId === wanted && entry.date === date)
    .sort((left, right) => compareStamps(left.from, right.from));
}

/** Entries that overlap each other, which cannot both be true. */
export function overlaps(entries) {
  const sorted = [...entries].sort((left, right) => compareStamps(left.from, right.from));
  const found = [];
  for (let i = 1; i < sorted.length; i += 1) {
    if (compareStamps(sorted[i].from, sorted[i - 1].to) < 0) {
      found.push([sorted[i - 1], sorted[i]]);
    }
  }
  return found;
}

/**
 * Add a day up.
 *
 * @returns {object} minutes on tickets, minutes elsewhere and the split
 */
export function daySummary(entries, locatorId, date) {
  const mine = dayEntries(entries, locatorId, date);
  const byActivity = {};
  let ticketMinutes = 0;
  let otherMinutes = 0;
  const tickets = new Set();
  for (const entry of mine) {
    byActivity[entry.activity] = (byActivity[entry.activity] ?? 0) + entry.minutes;
    if (entry.activity === 'TICKET') {
      ticketMinutes += entry.minutes;
      tickets.add(entry.number);
    } else {
      otherMinutes += entry.minutes;
    }
  }
  const totalMinutes = ticketMinutes + otherMinutes;
  return deepFreeze({
    locatorId: normaliseCode(locatorId),
    date,
    entries: mine.length,
    tickets: tickets.size,
    ticketMinutes,
    otherMinutes,
    totalMinutes,
    byActivity,
    ticketsPerHour: ticketMinutes === 0 ? 0 : tickets.size / (ticketMinutes / 60),
    utilisation: totalMinutes === 0 ? 0 : ticketMinutes / totalMinutes,
  });
}

/** Minutes booked against one ticket across everybody. */
export function minutesOnTicket(entries, number) {
  const wanted = normaliseCode(number);
  return entries
    .filter((entry) => entry.number === wanted)
    .reduce((sum, entry) => sum + entry.minutes, 0);
}

/** The days a locator booked any time at all. */
export function daysWorked(entries, locatorId) {
  const wanted = normaliseCode(locatorId);
  const days = new Set(
    entries.filter((entry) => entry.locatorId === wanted).map((entry) => entry.date)
  );
  return [...days].sort();
}
