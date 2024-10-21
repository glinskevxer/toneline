/**
 * Amending a posting.
 *
 * A posting is never edited. When the desk gets it wrong, or the ground changes
 * under a ticket that was already answered, a new posting goes up naming the
 * one it replaces. The centre keeps both and so do we, because the first answer
 * is what the excavator acted on and that is the thing an investigation wants.
 */

import { deepFreeze } from '../core/fields.js';
import { compareStamps } from '../time/stamp.js';
import { ResponseError } from './codes.js';
import { buildResponse, coversType, sortResponses } from './post.js';

/**
 * Build the posting that replaces another.
 *
 * @param {object} original the posting being replaced
 * @param {object} changes the fields that differ
 * @param {object} args
 * @param {string} args.at when the correction is being made
 * @param {string} args.by who is making it
 * @param {string} args.reason why
 */
export function amendResponse(original, changes, { at, by, reason }) {
  if (compareStamps(at, original.at) <= 0) {
    throw new ResponseError('an amendment has to come after the posting it replaces', {
      number: original.number,
      at,
      original: original.at,
    });
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new ResponseError('an amendment has to say why', { number: original.number });
  }
  return buildResponse({
    number: original.number,
    code: original.code,
    facilityType: original.scope === 'ALL' ? null : original.scope,
    marksThrough: original.marksThrough,
    meetAt: original.meetAt,
    ...changes,
    at,
    by,
    note: reason.trim(),
    supersedes: original.at,
  });
}

/** True when the posting has been replaced by a later one. */
export function isSuperseded(response, responses) {
  return responses.some(
    (other) => other.number === response.number && other.supersedes === response.at
  );
}

/** The postings that still stand, with the replaced ones dropped. */
export function effectiveResponses(responses) {
  return sortResponses(responses).filter((response) => !isSuperseded(response, responses));
}

/**
 * The chain behind one posting, oldest first.
 *
 * Following `supersedes` back gives the history of one answer, which is what an
 * investigation reads rather than the whole ticket.
 */
export function amendmentChain(response, responses) {
  const byStamp = new Map(
    responses.filter((entry) => entry.number === response.number).map((entry) => [entry.at, entry])
  );
  const chain = [response];
  let cursor = response;
  while (cursor.supersedes !== null) {
    const previous = byStamp.get(cursor.supersedes);
    if (previous === undefined) break;
    chain.unshift(previous);
    cursor = previous;
  }
  return chain;
}

/** How many times an answer has been corrected. */
export function amendmentCount(responses, number) {
  return responses.filter((entry) => entry.number === number && entry.supersedes !== null).length;
}

/** The standing answer for one facility type, or null. */
export function standingAnswer(responses, { number, scope = null }) {
  const mine = effectiveResponses(responses.filter((entry) => entry.number === number));
  const matching = scope === null ? mine : mine.filter((entry) => coversType(entry, scope));
  return matching.length === 0 ? null : deepFreeze({ ...matching[matching.length - 1] });
}
