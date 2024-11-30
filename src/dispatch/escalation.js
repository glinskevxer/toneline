/**
 * Escalation.
 *
 * A ticket the desk is going to miss should reach a person before it is missed,
 * not after. Escalation runs off three separate clocks and takes the worst of
 * them: how long an emergency has sat unacknowledged, how close an ordinary
 * ticket is to its deadline, and whether a critical conflict is still sitting
 * with nobody.
 */

import { deepFreeze } from '../core/fields.js';
import { minutesBetween } from '../time/stamp.js';
import { responseDueAt } from '../response/clock.js';
import { districtByCode } from '../network/district.js';
import { ticketType } from '../ticket/types.js';

/** The levels, in the order they are climbed. */
export const ESCALATION_LEVELS = Object.freeze(['none', 'supervisor', 'manager', 'duty officer']);

/** The clocks the desk escalates on. */
export const DEFAULT_ESCALATION_POLICY = Object.freeze({
  emergencyAcknowledgeMinutes: 15,
  emergencyManagerMinutes: 45,
  warnMinutesBeforeDue: 60,
  breachManagerMinutes: 120,
  criticalUnassignedMinutes: 30,
});

/** Merge a partial escalation policy over the defaults. */
export function escalationPolicy(overrides = {}) {
  return Object.freeze({ ...DEFAULT_ESCALATION_POLICY, ...overrides });
}

/** The higher of two levels. */
export function worseLevel(left, right) {
  return ESCALATION_LEVELS.indexOf(left) >= ESCALATION_LEVELS.indexOf(right) ? left : right;
}

/**
 * Work out where one ticket stands.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {string} args.at the moment the check is run
 * @param {object} [args.screening] the screening, when there is one
 * @param {object} [args.assignment] the assignment, when it has been handed out
 * @param {boolean} [args.answered] whether a posting has been made
 * @param {object} [args.escalation] escalation policy, under its own key so the
 *   response clock policy can travel in the same argument bag
 * @returns {object} a frozen escalation record
 */
export function assessEscalation(ticket, args) {
  const {
    at,
    screening = null,
    assignment = null,
    answered = false,
    escalation = DEFAULT_ESCALATION_POLICY,
    ...clockOptions
  } = args;
  const policy = escalation;
  const reasons = [];
  let level = 'none';
  if (answered) {
    return deepFreeze({ number: ticket.number, level, reasons, minutesLeft: null });
  }

  const dueAt = responseDueAt(ticket, clockOptions);
  const minutesLeft = minutesBetween(at, dueAt);
  const openMinutes = minutesBetween(ticket.receivedAt, at);
  const definition = ticketType(ticket.type);

  if (definition.rank === 0) {
    if (assignment === null && openMinutes >= policy.emergencyAcknowledgeMinutes) {
      level = worseLevel(level, 'supervisor');
      reasons.push('an emergency has not been picked up');
    }
    if (openMinutes >= policy.emergencyManagerMinutes) {
      level = worseLevel(level, 'manager');
      reasons.push('an emergency has been open too long');
    }
  }
  if (minutesLeft < 0) {
    level = worseLevel(level, 'supervisor');
    reasons.push('the response deadline has passed');
    if (-minutesLeft >= policy.breachManagerMinutes) {
      level = worseLevel(level, 'manager');
      reasons.push('the deadline passed some time ago');
    }
  } else if (minutesLeft <= policy.warnMinutesBeforeDue) {
    level = worseLevel(level, 'supervisor');
    reasons.push('the response deadline is close');
  }
  if (
    screening !== null &&
    screening.critical &&
    assignment === null &&
    openMinutes >= policy.criticalUnassignedMinutes
  ) {
    level = worseLevel(level, 'manager');
    reasons.push('a critical conflict is still with nobody');
  }
  if (level === 'manager' && definition.rank === 0 && minutesLeft < 0) {
    level = 'duty officer';
    reasons.push('an emergency has been missed');
  }
  return deepFreeze({ number: ticket.number, level, reasons, minutesLeft });
}

/** Run the check over a set of tickets and keep only what needs escalating. */
export function escalations(entries, args) {
  return entries
    .map((entry) => assessEscalation(entry.ticket, { ...args, ...entry }))
    .filter((record) => record.level !== 'none')
    .sort(
      (left, right) =>
        ESCALATION_LEVELS.indexOf(right.level) - ESCALATION_LEVELS.indexOf(left.level) ||
        left.minutesLeft - right.minutesLeft ||
        left.number.localeCompare(right.number)
    );
}

/** Who to ring for a district, falling back to the desk contact. */
export function contactFor(districts, code, fallback = null) {
  const district = districtByCode(districts, code);
  if (district === null) return fallback;
  return district.afterHoursPhone ?? district.contact ?? fallback;
}

/** How many records sit at each level. */
export function levelCounts(records) {
  const counts = Object.fromEntries(ESCALATION_LEVELS.map((level) => [level, 0]));
  for (const record of records) counts[record.level] += 1;
  return counts;
}
