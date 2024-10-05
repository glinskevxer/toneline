/**
 * The work queue.
 *
 * Ordering the day is where several rules meet, and they do not agree. An
 * emergency outranks everything. After that a ticket already past its deadline
 * outranks one that is not, whatever type it is. Only then does the screening
 * matter, and criticality is a tie break rather than a promotion, because a
 * critical facility on a ticket with three days left is not urgent yet.
 */

import { deepFreeze } from '../core/fields.js';
import { minutesBetween } from '../time/stamp.js';
import { responseDueAt } from '../response/clock.js';
import { ticketType } from './types.js';

/** The weight each band carries, lower sorts first. */
export const PRIORITY_BANDS = Object.freeze({
  emergency: 0,
  breached: 10,
  dueSoon: 20,
  critical: 30,
  ordinary: 40,
  design: 50,
});

/**
 * Score one ticket.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {string} args.at the moment the queue is being built
 * @param {object} [args.screening] the screening, when there is one
 * @returns {object} a frozen queue entry
 */
export function scoreTicket(ticket, args) {
  const { at, screening = null, ...clockOptions } = args;
  const definition = ticketType(ticket.type);
  const dueAt = responseDueAt(ticket, clockOptions);
  const minutesLeft = minutesBetween(at, dueAt);
  const critical = screening !== null && screening.critical;
  const band = bandFor({ definition, minutesLeft, critical });
  return deepFreeze({
    number: ticket.number,
    type: ticket.type,
    dueAt,
    minutesLeft,
    critical,
    band,
    weight: PRIORITY_BANDS[band],
    reason: reasonFor(band),
  });
}

function bandFor({ definition, minutesLeft, critical }) {
  if (definition.rank === 0) return 'emergency';
  if (minutesLeft < 0) return 'breached';
  if (minutesLeft <= 240) return 'dueSoon';
  if (critical) return 'critical';
  if (!definition.requiresMarking) return 'design';
  return 'ordinary';
}

function reasonFor(band) {
  switch (band) {
    case 'emergency':
      return 'an emergency outranks everything else';
    case 'breached':
      return 'the response deadline has already passed';
    case 'dueSoon':
      return 'the response deadline is inside four hours';
    case 'critical':
      return 'a critical facility runs through the work area';
    case 'design':
      return 'a design request can wait behind marking work';
    default:
      return 'ordinary marking work';
  }
}

/**
 * Order a set of tickets for the day.
 *
 * @param {Array<{ticket: object, screening?: object}>} entries
 * @param {object} args as for {@link scoreTicket}
 */
export function orderQueue(entries, args) {
  return entries
    .map(({ ticket, screening = null }) => scoreTicket(ticket, { ...args, screening }))
    .sort(
      (left, right) =>
        left.weight - right.weight ||
        left.minutesLeft - right.minutesLeft ||
        left.number.localeCompare(right.number)
    );
}

/** How many entries fall in each band. */
export function bandCounts(scored) {
  const counts = Object.fromEntries(Object.keys(PRIORITY_BANDS).map((band) => [band, 0]));
  for (const entry of scored) counts[entry.band] += 1;
  return counts;
}

/** The entries a supervisor should look at before anything else. */
export function head(scored, count = 5) {
  return scored.slice(0, Math.max(0, count));
}
