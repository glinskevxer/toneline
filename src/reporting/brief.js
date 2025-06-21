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
import { exceptionReport, nextActions } from './exceptions.js';
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
 * @param {object[]} [args.compliance] compliance records, when there are any
 */
export function buildBrief({
  desk,
  tickets,
  at,
  assignments = [],
  responses = [],
  damages = [],
  compliance = [],
}) {
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
  const entries = open.map((ticket) => ({
    ticket,
    screening: screenings.get(ticket.number),
    assignment: owner.get(ticket.number) ?? null,
    answered: answered.has(ticket.number),
  }));
  const chase = escalations(entries, { at, ...scheduling });
  // The brief and the exception report were counting the same things in two
  // places, which is how they came to disagree about an answered ticket. The
  // brief now reads the report rather than keeping its own tally.
  const problems = exceptionReport({
    tickets: open,
    compliance,
    entries,
    network: desk.network,
    at,
    ...scheduling,
  });

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
    exceptions: problems.counts,
    nextActions: nextActions(problems, 5),
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

/** The brief as the lines a supervisor reads out at the morning meeting. */
export function briefLines(brief) {
  const lines = [briefHeadline(brief)];
  if (brief.unassigned > 0) lines.push(`${brief.unassigned} tickets are with nobody`);
  if (brief.breached.length > 0) lines.push(`breached: ${brief.breached.join(' ')}`);
  for (const action of brief.nextActions) {
    lines.push(`${action.subject}: ${action.summary}`);
  }
  if (brief.damagesToday > 0) lines.push(`${brief.damagesToday} damages reported today`);
  return lines;
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
