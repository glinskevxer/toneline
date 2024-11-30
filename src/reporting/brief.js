/**
 * The morning brief.
 *
 * One object holding everything a supervisor needs before the crews go out:
 * what is open, what is about to breach, what has to be escalated and how
 * yesterday went. Assembling it here rather than in the command means the same
 * brief can be printed, mailed or filed without three versions of the truth.
 */

import { deepFreeze } from '../core/fields.js';
import { dateOf } from '../time/stamp.js';
import { ageTickets, bucketCounts, openTickets } from './aging.js';
import { escalations, levelCounts } from '../dispatch/escalation.js';
import { orderQueue, bandCounts } from '../ticket/priority.js';
import { screenTicket } from '../screening/screen.js';
import { screeningContext } from '../config/load.js';

/**
 * Build the brief.
 *
 * @param {object} args
 * @param {object} args.desk the loaded desk
 * @param {object[]} args.tickets everything the desk is holding
 * @param {string} args.at the moment the brief is drawn
 * @param {object[]} [args.assignments] what has been handed out
 * @param {object[]} [args.responses] what has been posted
 * @param {object[]} [args.damages] damages recorded
 */
export function buildBrief({ desk, tickets, at, assignments = [], responses = [], damages = [] }) {
  const context = screeningContext(desk);
  const scheduling = {
    calendar: desk.calendar,
    schedule: desk.schedule,
    policy: desk.policies.clock,
  };
  const open = openTickets(tickets);
  const answered = new Set(responses.map((response) => response.number));
  const owner = new Map(assignments.map((assignment) => [assignment.number, assignment]));

  const screenings = new Map(open.map((ticket) => [ticket.number, screenTicket(ticket, context)]));
  const rows = ageTickets(open, { at, ...scheduling });
  const queue = orderQueue(
    open.map((ticket) => ({ ticket, screening: screenings.get(ticket.number) })),
    { at, ...scheduling }
  );
  const chase = escalations(
    open.map((ticket) => ({
      ticket,
      screening: screenings.get(ticket.number),
      assignment: owner.get(ticket.number) ?? null,
      answered: answered.has(ticket.number),
    })),
    { at, ...scheduling }
  );

  return deepFreeze({
    at,
    date: dateOf(at),
    operator: desk.operator.name,
    open: open.length,
    held: tickets.length - open.length,
    unassigned: open.filter((ticket) => !owner.has(ticket.number)).length,
    buckets: bucketCounts(rows),
    bands: bandCounts(queue),
    escalations: chase,
    escalationCounts: levelCounts(chase),
    queue: queue.slice(0, 10),
    breached: rows.filter((row) => row.bucket === 'breached').map((row) => row.number),
    damagesToday: damages.filter((damage) => dateOf(damage.at) === dateOf(at)).length,
  });
}

/** The one line a supervisor reads first. */
export function briefHeadline(brief) {
  const worst =
    brief.escalations.length === 0
      ? 'nothing to escalate'
      : `${brief.escalations.length} to escalate`;
  return `${brief.open} open, ${brief.buckets.breached} breached, ${worst}`;
}

/** True when the brief holds nothing that needs a person today. */
export function isQuiet(brief) {
  return brief.escalations.length === 0 && brief.buckets.breached === 0;
}

/** The brief reduced to the numbers worth trending. */
export function briefNumbers(brief) {
  return {
    open: brief.open,
    unassigned: brief.unassigned,
    breached: brief.buckets.breached,
    dueWithinTheHour: brief.buckets['due within the hour'],
    escalations: brief.escalations.length,
    damagesToday: brief.damagesToday,
  };
}
