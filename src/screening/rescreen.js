/**
 * Screening a ticket again.
 *
 * When plant moves under an open ticket the desk has to know whether the answer
 * it already gave is still true. Comparing two screenings is not the same as
 * comparing two lists of facilities: a run appearing at forty feet changes
 * nothing, and a run appearing inside the tolerance zone changes everything.
 */

import { deepFreeze } from '../core/fields.js';
import { screenTicket } from './screen.js';
import { recommendResponse } from '../response/decide.js';

/** The facility ids a screening found inside their tolerance zone. */
export function conflictingIds(screening) {
  return screening.hits
    .filter((hit) => hit.insideTolerance && !hit.abandoned)
    .map((hit) => hit.facilityId)
    .sort();
}

/**
 * Compare two screenings of the same ticket.
 *
 * @param {object} before the screening as it was
 * @param {object} after the screening as it now is
 * @returns {object} a frozen difference
 */
export function compareScreenings(before, after) {
  const wasConflicting = new Set(conflictingIds(before));
  const nowConflicting = new Set(conflictingIds(after));
  const appeared = [...nowConflicting].filter((id) => !wasConflicting.has(id)).sort();
  const gone = [...wasConflicting].filter((id) => !nowConflicting.has(id)).sort();
  return deepFreeze({
    number: after.number,
    appeared,
    gone,
    conflictChanged: before.conflict !== after.conflict,
    criticalChanged: before.critical !== after.critical,
    oursChanged: before.ours !== after.ours,
    changed: appeared.length > 0 || gone.length > 0 || before.ours !== after.ours,
  });
}

/**
 * Screen a ticket again and say whether the answer has to change.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {object} args.before the screening the desk answered from
 * @param {object} args.context the screening context to use now
 * @returns {object} the new screening, the difference and the advice
 */
export function rescreenTicket(ticket, { before, context }) {
  const after = screenTicket(ticket, context);
  const difference = compareScreenings(before, after);
  const advice = recommendResponse(ticket, after);
  return deepFreeze({
    screening: after,
    difference,
    advice,
    needsNewPosting: difference.changed || difference.conflictChanged,
  });
}

/**
 * Rescreen a set of tickets and keep only the ones whose answer moved.
 *
 * @param {Array<{ticket: object, before: object}>} entries
 * @param {object} context the screening context
 */
export function rescreenBatch(entries, context) {
  const moved = [];
  for (const entry of entries) {
    const result = rescreenTicket(entry.ticket, { before: entry.before, context });
    if (result.needsNewPosting) moved.push({ number: entry.ticket.number, ...result });
  }
  return moved;
}

/** A one line description of what moved. */
export function describeDifference(difference) {
  if (!difference.changed && !difference.conflictChanged) return 'nothing changed';
  const parts = [];
  if (difference.appeared.length > 0)
    parts.push(`${difference.appeared.join(' ')} now in the zone`);
  if (difference.gone.length > 0) parts.push(`${difference.gone.join(' ')} no longer in the zone`);
  if (difference.oursChanged) parts.push('the ticket changed hands');
  if (parts.length === 0 && difference.conflictChanged) parts.push('the conflict verdict flipped');
  return parts.join(', ');
}
