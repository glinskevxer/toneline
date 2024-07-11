/**
 * Compliance.
 *
 * The regulator asks two questions about every ticket: was it answered, and was
 * it answered in time. They are separate, and a ticket can fail either one on
 * its own, so the evaluation reports both rather than collapsing them into a
 * single pass or fail.
 */

import { deepFreeze } from '../core/fields.js';
import { compareStamps } from '../time/stamp.js';
import { conflictingTypes } from '../screening/screen.js';
import { isFullyAnswered, outstandingScopes, sortResponses } from './post.js';
import { minutesLate, responseDueAt } from './clock.js';

/**
 * Work out where one ticket stands.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {object[]} [args.responses] postings made against the ticket
 * @param {object} [args.screening] the screening, used to know what has to be answered
 * @param {string} args.at the moment the question is being asked
 * @returns {object} a frozen compliance record
 */
export function evaluateCompliance(ticket, args) {
  const { responses = [], screening = null, at, ...clockOptions } = args;
  const dueAt = responseDueAt(ticket, clockOptions);
  const mine = sortResponses(responses.filter((response) => response.number === ticket.number));
  const required = screening === null ? [] : conflictingTypes(screening);
  const complete = mine.length > 0 && isFullyAnswered(mine, required);
  const first = mine.length === 0 ? null : mine[0].at;
  const closing = complete ? mine[mine.length - 1].at : null;
  const late = first === null ? null : minutesLate(ticket, first, clockOptions);

  return deepFreeze({
    number: ticket.number,
    type: ticket.type,
    dueAt,
    firstPostedAt: first,
    completedAt: closing,
    postings: mine.length,
    answered: mine.length > 0,
    complete,
    outstanding: screening === null ? [] : outstandingScopes(mine, required),
    minutesLate: late,
    onTime: late === null ? false : late <= 0,
    status: statusFor({ answered: mine.length > 0, complete, late, dueAt, at }),
  });
}

function statusFor({ answered, complete, late, dueAt, at }) {
  if (!answered) return compareStamps(at, dueAt) > 0 ? 'missed' : 'open';
  if (late > 0) return complete ? 'late' : 'late and incomplete';
  return complete ? 'compliant' : 'incomplete';
}

/** Evaluate a run of tickets against their postings. */
export function evaluateBatch(pairs, args) {
  return pairs.map(({ ticket, responses, screening }) =>
    evaluateCompliance(ticket, { ...args, responses, screening })
  );
}

/** Roll a run of evaluations up into the numbers a regulator asks for. */
export function complianceSummary(records) {
  const summary = {
    tickets: records.length,
    answered: 0,
    complete: 0,
    onTime: 0,
    late: 0,
    missed: 0,
    open: 0,
    worstMinutesLate: 0,
    onTimeRate: 0,
  };
  for (const record of records) {
    if (record.answered) summary.answered += 1;
    if (record.complete) summary.complete += 1;
    if (record.onTime) summary.onTime += 1;
    if (record.minutesLate !== null && record.minutesLate > 0) {
      summary.late += 1;
      summary.worstMinutesLate = Math.max(summary.worstMinutesLate, record.minutesLate);
    }
    if (record.status === 'missed') summary.missed += 1;
    if (record.status === 'open') summary.open += 1;
  }
  summary.onTimeRate = records.length === 0 ? 0 : summary.onTime / records.length;
  return deepFreeze(summary);
}

/** The evaluations a supervisor needs to look at, worst first. */
export function exceptions(records) {
  return records
    .filter((record) => record.status !== 'compliant' && record.status !== 'open')
    .sort(
      (left, right) =>
        (right.minutesLate ?? Number.MAX_SAFE_INTEGER) -
          (left.minutesLate ?? Number.MAX_SAFE_INTEGER) || left.number.localeCompare(right.number)
    );
}
