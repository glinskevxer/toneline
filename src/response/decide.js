/**
 * Choosing a response code.
 *
 * The screening says what is in the ground; this says what to tell the centre.
 * The order matters and it is not the order the codes are numbered in: whether
 * the ticket is ours at all comes first, then whether anything of ours is live
 * near the dig, then whether any of it is critical enough to want a meet.
 */

import { deepFreeze } from '../core/fields.js';
import { facilityType, ticketType } from '../ticket/types.js';
import { responseCode } from './codes.js';

/**
 * Recommend one response code for the whole ticket.
 *
 * @param {object} ticket
 * @param {object} screening result from `screenTicket`
 * @param {object} [options]
 * @param {boolean} [options.meetOnCritical] ask for a meet on a critical conflict
 * @returns {{code: string, key: string, reason: string, scope: string}}
 */
export function recommendResponse(ticket, screening, options = {}) {
  const { meetOnCritical = true } = options;
  const definition = ticketType(ticket.type);

  if (!screening.ours) {
    return decision('9', 'the work area is outside every district we serve');
  }
  if (screening.workArea.source === 'none') {
    return decision('6', 'the ticket carries no geometry, so the site has to be found on foot');
  }
  const live = screening.hits.filter((hit) => !hit.abandoned);
  if (live.length === 0) {
    const abandonedOnly = screening.hits.length > 0;
    return abandonedOnly
      ? decision('8', 'only abandoned facilities are near the work area')
      : decision('1', 'nothing of ours is near the work area');
  }
  const inTolerance = live.filter((hit) => hit.insideTolerance);
  if (inTolerance.length === 0) {
    return decision('1', 'our facilities are near but none reach the work area');
  }
  if (definition.code === 'MEET') {
    return decision('4', 'the excavator asked for a meet');
  }
  // A ticket type that puts nobody on the ground is settled before the critical
  // check, because a design request is answered with records at a meet whatever
  // is buried in the corridor, and marking it would be the wrong answer twice.
  if (!definition.requiresMarking) {
    return decision('4', 'a design request is answered with records rather than marks');
  }
  if (meetOnCritical && inTolerance.some((hit) => hit.critical)) {
    return decision('7', 'a critical facility runs through the work area');
  }
  return decision('2', 'our facilities in the work area have been marked');
}

function decision(code, reason, scope = 'ALL') {
  const found = responseCode(code);
  return deepFreeze({ code: found.code, key: found.key, reason, scope });
}

/**
 * Recommend a code per facility type rather than one for the whole ticket.
 *
 * A ticket carrying gas inside the tolerance zone and electric well outside it
 * gets two different answers, and the centre wants both.
 */
export function recommendByScope(ticket, screening, options = {}) {
  const whole = recommendResponse(ticket, screening, options);
  if (whole.code === '9' || whole.code === '6' || screening.hits.length === 0) {
    return [whole];
  }
  const byType = new Map();
  for (const hit of screening.hits) {
    const bucket = byType.get(hit.type) ?? [];
    bucket.push(hit);
    byType.set(hit.type, bucket);
  }
  const out = [];
  for (const type of [...byType.keys()].sort()) {
    const hits = byType.get(type);
    const scoped = recommendResponse(ticket, { ...screening, hits }, options);
    out.push({ ...scoped, scope: facilityType(type).code });
  }
  return out.map((entry) => deepFreeze(entry));
}

/** True when the recommendation leaves the ticket needing another visit. */
export function needsAnotherVisit(recommendation) {
  return responseCode(recommendation.code).needsFollowUp;
}

/** A one line summary of a recommendation for the audit trail. */
export function describeRecommendation(recommendation) {
  const found = responseCode(recommendation.code);
  return `${recommendation.scope} ${found.code} ${found.label}: ${recommendation.reason}`;
}
