/**
 * Ageing the open work.
 *
 * A supervisor wants one screen every morning: what is still open, how long it
 * has been open, and what is about to breach. Ageing runs off the response
 * deadline rather than the received time, because a design request sitting for
 * a week is fine and an emergency sitting for an hour is not.
 */

import { deepFreeze } from '../core/fields.js';
import { compareStamps, minutesBetween } from '../time/stamp.js';
import { responseDueAt } from '../response/clock.js';
import { ticketType } from '../ticket/types.js';

/** The buckets the morning screen is split into, worst first. */
export const AGING_BUCKETS = Object.freeze([
  'breached',
  'due within the hour',
  'due today',
  'later',
]);

/** Which bucket a ticket falls into at a moment in time. */
export function bucketFor(minutesLeft) {
  if (minutesLeft < 0) return 'breached';
  if (minutesLeft <= 60) return 'due within the hour';
  if (minutesLeft <= 720) return 'due today';
  return 'later';
}

/**
 * Age one ticket.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {string} args.at the moment the screen is being drawn
 * @returns {object} a frozen ageing row
 */
export function ageTicket(ticket, args) {
  const { at, ...clockOptions } = args;
  const dueAt = responseDueAt(ticket, clockOptions);
  const minutesLeft = minutesBetween(at, dueAt);
  return deepFreeze({
    number: ticket.number,
    type: ticket.type,
    status: ticket.status,
    receivedAt: ticket.receivedAt,
    dueAt,
    minutesOpen: Math.max(0, minutesBetween(ticket.receivedAt, at)),
    minutesLeft,
    bucket: bucketFor(minutesLeft),
    rank: ticketType(ticket.type).rank,
  });
}

/** Age a run of tickets and sort them the way the screen shows them. */
export function ageTickets(tickets, args) {
  return tickets
    .map((ticket) => ageTicket(ticket, args))
    .sort(
      (left, right) =>
        left.minutesLeft - right.minutesLeft ||
        left.rank - right.rank ||
        left.number.localeCompare(right.number)
    );
}

/** How many rows fall in each bucket. */
export function bucketCounts(rows) {
  const counts = Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0]));
  for (const row of rows) counts[row.bucket] += 1;
  return counts;
}

/** Only the rows already past their deadline. */
export function breached(rows) {
  return rows.filter((row) => row.bucket === 'breached');
}

/** The longest a ticket has been open, in minutes. */
export function oldestMinutes(rows) {
  return rows.reduce((worst, row) => Math.max(worst, row.minutesOpen), 0);
}

/**
 * Split the open work by whoever it sits with.
 *
 * @param {object[]} rows ageing rows
 * @param {object[]} assignments the assignments made
 */
export function byLocator(rows, assignments) {
  const owner = new Map(assignments.map((assignment) => [assignment.number, assignment.locatorId]));
  const grouped = new Map();
  for (const row of rows) {
    const key = owner.get(row.number) ?? 'unassigned';
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  return [...grouped.keys()]
    .sort()
    .map((locatorId) => ({ locatorId, rows: grouped.get(locatorId) }));
}

/** True when the ticket is one the desk still owes an answer on. */
export function isOpen(ticket) {
  return !['RESPONDED', 'CLOSED', 'CANCELLED', 'VOID'].includes(ticket.status);
}

/** The open tickets out of a set, in the order they were given. */
export function openTickets(tickets) {
  return tickets.filter(isOpen);
}

/** The next deadline across a set of rows, or null when there are none. */
export function nextDeadline(rows) {
  if (rows.length === 0) return null;
  return rows.reduce(
    (soonest, row) => (compareStamps(row.dueAt, soonest) < 0 ? row.dueAt : soonest),
    rows[0].dueAt
  );
}
