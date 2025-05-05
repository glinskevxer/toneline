/**
 * Nudging before the deadline.
 *
 * A locator holding six tickets does not need to be told about all six. The
 * reminder rules are deliberately quiet: one nudge per ticket per stage, the
 * stages chosen so the last one still leaves time to drive there, and nothing
 * at all once the ticket has been answered.
 */

import { deepFreeze, normaliseCode } from '../core/fields.js';
import { compareStamps, minutesBetween } from '../time/stamp.js';
import { responseDueAt } from './clock.js';

/** The stages a reminder is sent at, in minutes before the deadline. */
export const DEFAULT_REMINDER_STAGES = Object.freeze([240, 60, 15]);

/** Build the reminder rules. */
export function reminderRules(stages = DEFAULT_REMINDER_STAGES) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new TypeError('reminder stages must be a list with something in it');
  }
  for (const stage of stages) {
    if (!Number.isInteger(stage) || stage <= 0) {
      throw new TypeError('a reminder stage must be a whole number of minutes above zero');
    }
  }
  return Object.freeze([...stages].sort((left, right) => right - left));
}

/**
 * The stage a ticket is at, or null when it is not at one.
 *
 * The stage is the tightest one the ticket has passed, so a ticket checked
 * half an hour before its deadline is at the sixty minute stage and not the
 * four hour one it went through earlier.
 */
export function stageFor(minutesLeft, stages = DEFAULT_REMINDER_STAGES) {
  if (minutesLeft < 0) return 'overdue';
  const passed = stages.filter((stage) => minutesLeft <= stage);
  return passed.length === 0 ? null : String(passed[passed.length - 1]);
}

/**
 * Work out the reminders owed at a moment.
 *
 * @param {Array<{ticket: object, locatorId?: string}>} entries what is held
 * @param {object} args
 * @param {string} args.at the moment the check runs
 * @param {object[]} [args.responses] postings already made
 * @param {object[]} [args.sent] reminders already sent
 * @param {number[]} [args.stages] the stages to nudge at
 */
export function remindersDue(entries, args) {
  const { at, responses = [], sent = [], stages = DEFAULT_REMINDER_STAGES, ...clockOptions } = args;
  const answered = new Set(responses.map((response) => response.number));
  const already = new Set(sent.map((entry) => `${entry.number}:${entry.stage}`));
  const due = [];
  for (const { ticket, locatorId = null } of entries) {
    if (answered.has(ticket.number)) continue;
    const dueAt = responseDueAt(ticket, clockOptions);
    const stage = stageFor(minutesBetween(at, dueAt), stages);
    if (stage === null) continue;
    if (already.has(`${ticket.number}:${stage}`)) continue;
    due.push(
      deepFreeze({
        number: ticket.number,
        locatorId: locatorId === null ? null : normaliseCode(locatorId),
        stage,
        dueAt,
        minutesLeft: minutesBetween(at, dueAt),
        at,
      })
    );
  }
  return due.sort(
    (left, right) => left.minutesLeft - right.minutesLeft || left.number.localeCompare(right.number)
  );
}

/** Group reminders by who they go to. */
export function byRecipient(reminders) {
  const grouped = new Map();
  for (const reminder of reminders) {
    const key = reminder.locatorId ?? 'unassigned';
    const bucket = grouped.get(key) ?? [];
    bucket.push(reminder);
    grouped.set(key, bucket);
  }
  return [...grouped.keys()]
    .sort()
    .map((locatorId) => ({ locatorId, reminders: grouped.get(locatorId) }));
}

/** The line a locator gets. */
export function reminderLine(reminder) {
  if (reminder.stage === 'overdue') {
    return `${reminder.number} is past its deadline of ${reminder.dueAt}`;
  }
  return `${reminder.number} is due at ${reminder.dueAt}, ${reminder.minutesLeft} minutes away`;
}

/** True when a reminder has already gone out for that ticket and stage. */
export function alreadySent(sent, number, stage) {
  return sent.some((entry) => entry.number === number && entry.stage === String(stage));
}

/** The reminders that are for something already past its deadline. */
export function overdueOnly(reminders) {
  return reminders.filter((reminder) => reminder.stage === 'overdue');
}

/** True when a ticket was answered before a reminder would have gone out. */
export function beatenByAnswer(ticket, responses, dueAt) {
  return responses.some(
    (response) => response.number === ticket.number && compareStamps(response.at, dueAt) <= 0
  );
}
