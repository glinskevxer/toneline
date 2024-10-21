/**
 * Posting a response.
 *
 * A posting is the record of what the desk told the centre and when. It is
 * kept per facility type rather than per ticket, because a gas crew and an
 * electric crew finish at different times and the centre wants both.
 */

import { deepFreeze, optionalString, requireString } from '../core/fields.js';
import { compareStamps, isStamp } from '../time/stamp.js';
import { isDate } from '../time/date.js';
import { facilityType } from '../ticket/types.js';
import { ResponseError, responseCode } from './codes.js';

const ALL_FACILITIES = 'ALL';

/** Build a posting from a loose record, checking what the code demands. */
export function buildResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ResponseError('a response must be built from an object', { type: typeof raw });
  }
  const number = requireString(raw.number ?? raw.ticket, 'number').toUpperCase();
  const definition = responseCode(raw.code ?? raw.key);
  const at = requireString(raw.at, 'at');
  if (!isStamp(at)) {
    throw new ResponseError('a response needs a timestamp', { number, at });
  }
  const scope = readScope(raw.facilityType ?? raw.scope);
  const marksThrough = optionalString(raw.marksThrough, 'marksThrough');
  if (marksThrough !== null && !isDate(marksThrough)) {
    throw new ResponseError('marksThrough must be a calendar date', { number, marksThrough });
  }
  if (definition.requiresMarks && marksThrough === null) {
    throw new ResponseError('this response code has to say how long the marks are good for', {
      number,
      code: definition.code,
    });
  }
  const meetAt = optionalString(raw.meetAt, 'meetAt');
  if (meetAt !== null && !isStamp(meetAt)) {
    throw new ResponseError('meetAt must be a timestamp', { number, meetAt });
  }
  if (definition.key === 'MEET_SCHEDULED' && meetAt === null) {
    throw new ResponseError('a scheduled meet has to carry the time it was set for', { number });
  }
  const supersedes = optionalString(raw.supersedes, 'supersedes');
  if (supersedes !== null && !isStamp(supersedes)) {
    throw new ResponseError('a superseded posting is named by its own timestamp', {
      number,
      supersedes,
    });
  }
  return deepFreeze({
    number,
    code: definition.code,
    key: definition.key,
    scope,
    at,
    by: requireString(raw.by, 'by'),
    marksThrough,
    meetAt,
    note: optionalString(raw.note, 'note'),
    supersedes,
  });
}

function readScope(value) {
  if (value === null || value === undefined || String(value).trim() === '') return ALL_FACILITIES;
  const text = String(value).trim().toUpperCase();
  if (text === ALL_FACILITIES) return ALL_FACILITIES;
  return facilityType(text).code;
}

/** True when the posting covers that facility type. */
export function coversType(response, type) {
  if (response.scope === ALL_FACILITIES) return true;
  return response.scope === facilityType(type).code;
}

/** Postings sorted oldest first, with a stable order inside one minute. */
export function sortResponses(responses) {
  return [...responses].sort(
    (left, right) => compareStamps(left.at, right.at) || left.scope.localeCompare(right.scope)
  );
}

/** The latest posting on a ticket, or null when there is none. */
export function latestResponse(responses, { scope = null } = {}) {
  const wanted = scope === null ? null : readScope(scope);
  const eligible = sortResponses(responses).filter(
    (response) => wanted === null || coversType(response, wanted) || response.scope === wanted
  );
  return eligible.length === 0 ? null : eligible[eligible.length - 1];
}

/** The facility types a run of postings has covered. */
export function coveredScopes(responses) {
  const scopes = new Set();
  for (const response of responses) scopes.add(response.scope);
  return [...scopes].sort();
}

/** True when every facility type the screening found has been answered. */
export function isFullyAnswered(responses, requiredScopes) {
  if (responses.some((response) => response.scope === ALL_FACILITIES)) return true;
  const covered = new Set(responses.map((response) => response.scope));
  return requiredScopes.every((scope) => covered.has(facilityType(scope).code));
}

/** The scopes a screening still needs a posting for. */
export function outstandingScopes(responses, requiredScopes) {
  if (responses.some((response) => response.scope === ALL_FACILITIES)) return [];
  const covered = new Set(responses.map((response) => response.scope));
  return requiredScopes
    .map((scope) => facilityType(scope).code)
    .filter((scope) => !covered.has(scope));
}
