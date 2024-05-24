/**
 * The response clock.
 *
 * Every ticket carries a deadline for telling the centre what happened. The
 * clock starts when the desk received the transmission, runs for the hours the
 * ticket type allows, and on a marking ticket it can never run past the lawful
 * start, because paint on the ground after the digging has begun is no use to
 * anybody.
 */

import { ScheduleError } from '../core/errors.js';
import { Calendar } from '../time/calendar.js';
import { WorkSchedule } from '../time/workhours.js';
import { addHours, compareStamps, minutesBetween } from '../time/stamp.js';
import { effectiveLawfulStart } from '../ticket/lawfulStart.js';
import { ticketType } from '../ticket/types.js';

/** The clock policy this desk works to. */
export const DEFAULT_CLOCK_POLICY = Object.freeze({
  capAtLawfulStart: true,
  graceMinutes: 0,
});

/** Merge a partial clock policy over the defaults. */
export function clockPolicy(overrides = {}) {
  const policy = { ...DEFAULT_CLOCK_POLICY, ...overrides };
  if (!Number.isInteger(policy.graceMinutes) || policy.graceMinutes < 0) {
    throw new ScheduleError('grace must be a whole number of minutes at or above zero', {
      graceMinutes: policy.graceMinutes,
    });
  }
  return Object.freeze(policy);
}

/**
 * When a response is due on a ticket.
 *
 * @param {object} ticket
 * @param {object} [options]
 * @param {Calendar} [options.calendar]
 * @param {WorkSchedule} [options.schedule] used by types whose clock only runs while the desk is open
 * @param {object} [options.policy]
 * @returns {string} the last minute a posting counts as on time
 */
export function responseDueAt(ticket, options = {}) {
  const { calendar = new Calendar(), schedule, policy = DEFAULT_CLOCK_POLICY } = options;
  const definition = ticketType(ticket.type);
  const start = ticket.receivedAt;
  let due;
  if (definition.clockRunsOnWorkingHours) {
    const desk = schedule ?? new WorkSchedule({ calendar });
    if (!(desk instanceof WorkSchedule)) {
      throw new ScheduleError('the response clock needs a WorkSchedule instance', {
        number: ticket.number,
      });
    }
    due = desk.addWorkingHours(start, definition.responseHours);
  } else {
    due = addHours(start, definition.responseHours);
  }
  if (!policy.capAtLawfulStart || !definition.requiresMarking) return due;
  const lawful = effectiveLawfulStart(ticket, { calendar });
  // An immediate ticket has its lawful start at the moment it was taken, so the
  // cap would leave no time to answer at all. It only bites when the waiting
  // period actually puts the lawful start after the desk received the ticket.
  if (compareStamps(lawful, start) <= 0) return due;
  return compareStamps(lawful, due) < 0 ? lawful : due;
}

/** Minutes a posting was late by, negative when it was early. */
export function minutesLate(ticket, postedAt, options = {}) {
  const { policy = DEFAULT_CLOCK_POLICY } = options;
  const due = responseDueAt(ticket, options);
  return minutesBetween(due, postedAt) - policy.graceMinutes;
}

/** True when the posting landed inside the window. */
export function isOnTime(ticket, postedAt, options = {}) {
  return minutesLate(ticket, postedAt, options) <= 0;
}

/** Minutes left before the response is due, negative once it has passed. */
export function minutesRemaining(ticket, at, options = {}) {
  return minutesBetween(at, responseDueAt(ticket, options));
}

/**
 * A coarse bucket for reporting, worked out at a moment in time.
 *
 * `answered` and `late` describe a ticket that has been posted; `due` and
 * `overdue` describe one that has not.
 */
export function clockBucket(ticket, { at, postedAt = null, ...options } = {}) {
  if (postedAt !== null) {
    return isOnTime(ticket, postedAt, options) ? 'answered' : 'late';
  }
  const remaining = minutesRemaining(ticket, at, options);
  if (remaining < 0) return 'overdue';
  if (remaining <= 120) return 'due soon';
  return 'due';
}

/** Sort tickets by how close their response deadline is. */
export function byDeadline(tickets, options = {}) {
  return [...tickets].sort((left, right) => {
    const compared = compareStamps(responseDueAt(left, options), responseDueAt(right, options));
    if (compared !== 0) return compared;
    return ticketType(left.type).rank - ticketType(right.type).rank;
  });
}
