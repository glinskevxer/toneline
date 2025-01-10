/**
 * Moving work.
 *
 * Somebody calls in sick, a job runs long, an emergency lands in the middle of
 * a full day. Reassignment is the same choice as the first assignment with one
 * extra rule: the work does not move unless the new locator is genuinely better
 * placed, because a ticket that has been passed around three times is a ticket
 * nobody owns.
 */

import { deepFreeze, normaliseCode, requireString } from '../core/fields.js';
import { dateOf, isStamp } from '../time/stamp.js';
import { DispatchError, buildAssignment, candidatesFor, loadOn } from './assign.js';

/** Why work is being moved. */
export const REASSIGN_REASONS = Object.freeze([
  'ABSENT',
  'OVERLOADED',
  'SKILL',
  'DISTRICT',
  'REQUESTED',
]);

/** The current holder of a ticket, or null. */
export function currentHolder(assignments, number) {
  const wanted = normaliseCode(number);
  const mine = assignments
    .filter((assignment) => assignment.number === wanted)
    .sort((left, right) => left.at.localeCompare(right.at));
  return mine.length === 0 ? null : mine[mine.length - 1];
}

/** How many times a ticket has already been moved. */
export function handoverCount(assignments, number) {
  const wanted = normaliseCode(number);
  return Math.max(0, assignments.filter((assignment) => assignment.number === wanted).length - 1);
}

/**
 * Move a ticket to somebody else.
 *
 * @param {object} args
 * @param {string} args.number the ticket
 * @param {object[]} args.roster the locators available
 * @param {object[]} args.assignments every assignment so far
 * @param {string[]} args.types the facility types the ticket needs
 * @param {string|null} args.district the district the ticket falls in
 * @param {string} args.at when the move is being made
 * @param {string} args.by who is making it
 * @param {string} args.reason why
 * @param {string} [args.to] move to this locator rather than choosing
 * @param {number} [args.maxHandovers] refuse once the ticket has moved this often
 */
export function reassign(args) {
  const {
    number,
    roster,
    assignments,
    types,
    district = null,
    at,
    by,
    reason,
    to = null,
    maxHandovers = 2,
  } = args;
  if (!isStamp(at)) {
    throw new DispatchError('a reassignment needs a timestamp', { at });
  }
  const code = normaliseCode(reason);
  if (!REASSIGN_REASONS.includes(code)) {
    throw new DispatchError('that is not a reason we move work for', {
      reason,
      known: REASSIGN_REASONS,
    });
  }
  const held = currentHolder(assignments, number);
  if (held === null) {
    throw new DispatchError('the ticket has not been handed out yet', { number });
  }
  if (handoverCount(assignments, number) >= maxHandovers) {
    throw new DispatchError('the ticket has been passed around enough', {
      number,
      handovers: handoverCount(assignments, number),
    });
  }

  const candidates = candidatesFor(roster, { types, district, assignments, at }).filter(
    (entry) => entry.locator.id !== held.locatorId
  );
  if (candidates.length === 0) {
    throw new DispatchError('there is nobody else free and qualified', { number, types, district });
  }
  const chosen =
    to === null
      ? candidates[0]
      : (candidates.find((entry) => entry.locator.id === normaliseCode(to)) ?? null);
  if (chosen === null) {
    throw new DispatchError('the locator asked for cannot take the ticket', {
      number,
      to: normaliseCode(to),
    });
  }
  if (to === null && code === 'OVERLOADED') {
    const heldLoad = loadOn(assignments, held.locatorId, dateOf(at));
    // The move has to leave the heavier day lighter than it was. Handing one
    // ticket to somebody who is only one behind just swaps who is busiest.
    if (chosen.load + 1 >= heldLoad) {
      throw new DispatchError('moving the ticket would not lighten anybody', {
        number,
        from: held.locatorId,
        to: chosen.locator.id,
      });
    }
  }
  return deepFreeze({
    from: held.locatorId,
    assignment: buildAssignment({
      number: held.number,
      locatorId: chosen.locator.id,
      at,
      dueAt: held.dueAt,
      by: requireString(by, 'by'),
      district: held.district,
      types: held.types,
      note: `moved from ${held.locatorId}: ${code.toLowerCase()}`,
    }),
    reason: code,
  });
}

/** Move everything a locator holds on a day to whoever else can take it. */
export function coverFor(locatorId, args) {
  const { assignments, at } = args;
  const wanted = normaliseCode(locatorId);
  const day = dateOf(at);
  const theirs = assignments.filter(
    (assignment) => assignment.locatorId === wanted && dateOf(assignment.at) === day
  );
  const moved = [];
  const stuck = [];
  let running = [...assignments];
  for (const assignment of theirs) {
    if (currentHolder(running, assignment.number).locatorId !== wanted) continue;
    try {
      const result = reassign({
        ...args,
        number: assignment.number,
        assignments: running,
        types: assignment.types,
        district: assignment.district,
        reason: 'ABSENT',
      });
      running = [...running, result.assignment];
      moved.push(result);
    } catch (err) {
      stuck.push({ number: assignment.number, reason: err.message });
    }
  }
  return { moved, stuck };
}
