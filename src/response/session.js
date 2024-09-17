/**
 * Answering a run of tickets.
 *
 * Screening, deciding and posting are three separate steps on purpose, but the
 * desk runs them together for every ticket in a feed, so this is the one place
 * that knows how to turn a recommendation into a posting: where the marks date
 * comes from, when a meet gets put in the book, and which tickets are handed
 * back untouched for somebody to look at.
 */

import { addDays } from '../time/date.js';
import { atTime, dateOf } from '../time/stamp.js';
import { screenTicket } from '../screening/screen.js';
import { screeningContext } from '../config/load.js';
import { recommendByScope } from './decide.js';
import { buildResponse } from './post.js';
import { responseCode } from './codes.js';

/** Where a meet is put in the book when the desk offers one. */
export const DEFAULT_MEET_OFFSET_DAYS = 1;

/**
 * Answer one ticket.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {object} args.desk the loaded desk
 * @param {string} args.at when the desk is answering
 * @param {string} args.by who is answering
 * @param {string} [args.meetTime] the clock time a meet is offered at
 * @returns {{screening: object, postings: object[]}}
 */
export function answerTicket(ticket, args) {
  const { desk, at, by, meetTime = '08:00', meetOffsetDays = DEFAULT_MEET_OFFSET_DAYS } = args;
  const screening = screenTicket(ticket, screeningContext(desk));
  const advice = recommendByScope(ticket, screening);
  const marksThrough = addDays(dateOf(at), desk.policies.life.markLifeDays - 1);
  const postings = advice.map((entry) => {
    const definition = responseCode(entry.code);
    return buildResponse({
      number: ticket.number,
      code: entry.code,
      facilityType: entry.scope === 'ALL' ? null : entry.scope,
      at,
      by,
      marksThrough: definition.requiresMarks ? marksThrough : null,
      meetAt:
        definition.key === 'MEET_SCHEDULED'
          ? atTime(nextMeetDate(desk, at, meetOffsetDays), meetTime)
          : null,
      note: entry.reason,
    });
  });
  return { screening, postings };
}

/**
 * The day a meet is offered for.
 *
 * At least `offsetDays` out, and then the first business day at or after that,
 * so an offer never lands on a Saturday and never lands the same afternoon the
 * ticket came in.
 */
function nextMeetDate(desk, at, offsetDays) {
  const from = addDays(dateOf(at), Math.max(1, offsetDays));
  return desk.calendar.nextBusinessDay(from, { inclusive: true });
}

/**
 * Answer a whole feed.
 *
 * A ticket the desk cannot answer on its own is handed back rather than guessed
 * at, and the reason travels with it so the queue means something.
 */
export function answerBatch(tickets, args) {
  const postings = [];
  const screenings = [];
  const held = [];
  for (const ticket of tickets) {
    const { screening, postings: made } = answerTicket(ticket, args);
    screenings.push(screening);
    if (screening.workArea.source === 'none' && !screening.memberClaimed) {
      held.push({ number: ticket.number, reason: 'no geometry and no member code of ours' });
      continue;
    }
    postings.push(...made);
  }
  return { postings, screenings, held };
}

/** Group postings by the ticket they answer. */
export function postingsByTicket(postings) {
  const grouped = new Map();
  for (const posting of postings) {
    const bucket = grouped.get(posting.number) ?? [];
    bucket.push(posting);
    grouped.set(posting.number, bucket);
  }
  return grouped;
}

/** A one line summary of what a session did. */
export function sessionSummary({ postings, screenings, held }) {
  const codes = {};
  for (const posting of postings) {
    codes[posting.code] = (codes[posting.code] ?? 0) + 1;
  }
  return {
    tickets: screenings.length,
    postings: postings.length,
    held: held.length,
    conflicts: screenings.filter((screening) => screening.conflict).length,
    codes,
  };
}
