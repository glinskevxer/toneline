/**
 * Handing work out.
 *
 * The dispatcher picks a locator for a ticket from the people qualified on
 * every facility type the screening found, in the district the site falls in,
 * with room left in the day. Ties break on who has least on, and then on badge
 * number so the same input always gives the same answer.
 */

import { TonelineError } from '../core/errors.js';
import { deepFreeze, normaliseCode, optionalString, requireString } from '../core/fields.js';
import { dateOf, isStamp } from '../time/stamp.js';
import { conflictingTypes } from '../screening/screen.js';
import { coversDistrict, hasSkill } from './locator.js';

/** Raised when work cannot be handed out. */
export class DispatchError extends TonelineError {
  constructor(message, details = {}) {
    super('DISPATCH_FAILED', message, details);
  }
}

/** Build one assignment record. */
export function buildAssignment(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DispatchError('an assignment must be built from an object', { type: typeof raw });
  }
  const at = requireString(raw.at, 'at');
  if (!isStamp(at)) {
    throw new DispatchError('an assignment needs a timestamp', { at });
  }
  const dueAt = optionalString(raw.dueAt, 'dueAt');
  if (dueAt !== null && !isStamp(dueAt)) {
    throw new DispatchError('an assignment due time must be a timestamp', { dueAt });
  }
  return deepFreeze({
    number: requireString(raw.number, 'number').toUpperCase(),
    locatorId: requireString(raw.locatorId, 'locatorId').toUpperCase(),
    at,
    dueAt,
    by: requireString(raw.by, 'by'),
    district:
      raw.district === undefined || raw.district === null ? null : normaliseCode(raw.district),
    types: (raw.types ?? []).map((type) => normaliseCode(type)),
    note: optionalString(raw.note, 'note'),
  });
}

/** How many tickets a locator already has on a given day. */
export function loadOn(assignments, locatorId, date) {
  const wanted = normaliseCode(locatorId);
  return assignments.filter(
    (assignment) => assignment.locatorId === wanted && dateOf(assignment.at) === date
  ).length;
}

/** Everyone who could take the ticket, with their load, best first. */
export function candidatesFor(roster, { types, district, assignments, at }) {
  const date = dateOf(at);
  const wanted = types.map((type) => normaliseCode(type));
  return roster
    .filter((locator) => locator.active)
    .filter((locator) => wanted.every((type) => hasSkill(locator, type)))
    .filter((locator) => district === null || coversDistrict(locator, district))
    .map((locator) => ({ locator, load: loadOn(assignments, locator.id, date) }))
    .filter((entry) => entry.load < entry.locator.dailyCapacity)
    .sort(
      (left, right) => left.load - right.load || left.locator.id.localeCompare(right.locator.id)
    );
}

/**
 * Choose a locator and build the assignment.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {object} args.screening result from `screenTicket`
 * @param {object[]} args.roster the locators available
 * @param {object[]} [args.assignments] what has already been handed out today
 * @param {string} args.at when the assignment is being made
 * @param {string} args.by who is making it
 * @param {string} [args.dueAt] the response deadline to carry on the assignment
 */
export function assignTicket(ticket, args) {
  const { screening, roster, assignments = [], at, by, dueAt = null } = args;
  if (!screening.ours) {
    throw new DispatchError('the ticket is not ours to work', { number: ticket.number });
  }
  const types = conflictingTypes(screening);
  const district = screening.districts.length > 0 ? screening.districts[0] : null;
  const candidates = candidatesFor(roster, { types, district, assignments, at });
  if (candidates.length === 0) {
    throw new DispatchError('no locator is free and qualified for the ticket', {
      number: ticket.number,
      types,
      district,
    });
  }
  return buildAssignment({
    number: ticket.number,
    locatorId: candidates[0].locator.id,
    at,
    dueAt,
    by,
    district,
    types,
  });
}

/** Hand a run of tickets out, keeping the load balanced as it goes. */
export function assignBatch(pairs, args) {
  const { assignments = [], ...rest } = args;
  const made = [...assignments];
  const results = [];
  for (const { ticket, screening } of pairs) {
    try {
      const assignment = assignTicket(ticket, { ...rest, screening, assignments: made });
      made.push(assignment);
      results.push({ number: ticket.number, assignment, error: null });
    } catch (err) {
      results.push({ number: ticket.number, assignment: null, error: err.message });
    }
  }
  return { assignments: made.slice(assignments.length), results };
}

/** Every assignment for one locator on one day, oldest first. */
export function dayList(assignments, locatorId, date) {
  const wanted = normaliseCode(locatorId);
  return assignments
    .filter((assignment) => assignment.locatorId === wanted && dateOf(assignment.at) === date)
    .sort((left, right) => left.at.localeCompare(right.at));
}
