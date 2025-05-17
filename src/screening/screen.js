/**
 * Screening.
 *
 * The first thing the desk does with a ticket is decide whether it is ours at
 * all, and if it is, which runs of pipe or cable the dig could reach. Everything
 * downstream, the response code, the dispatch and the billing, reads the result
 * of this one pass.
 */

import { deepFreeze } from '../core/fields.js';
import { atOrAboveZero, definePolicy } from '../config/policies.js';
import { districtsForRing, isOurMember } from '../network/district.js';
import { toleranceFeetOf, toleranceMetresOf } from '../network/facility.js';
import { feetToMetres, metresToFeet } from '../geo/point.js';
import { facilityType } from '../ticket/types.js';
import { workAreaFor } from '../ticket/site.js';
import { withDepth } from './depth.js';

/** How far past the tolerance zone a facility is still worth reporting. */
export const DEFAULT_SCREEN_POLICY = Object.freeze({
  noticeMarginFeet: 25,
  reportAbandoned: true,
  checkDepth: true,
});

/** Merge a partial screen policy over the defaults. */
export const screenPolicy = definePolicy(DEFAULT_SCREEN_POLICY, {
  noticeMarginFeet: atOrAboveZero,
});

/**
 * Screen one ticket against the network.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {import('../network/network.js').FacilityNetwork} args.network
 * @param {object[]} [args.districts] service districts
 * @param {object} [args.policy] screen policy
 * @param {object} [args.site] site policy passed through to the work area
 * @returns {object} a frozen screening result
 */
export function screenTicket(
  ticket,
  { network, districts = [], policy = DEFAULT_SCREEN_POLICY, site } = {}
) {
  const area = workAreaFor(ticket, { policy: site });
  const memberClaimed = ticket.members.some((code) => isOurMember(districts, code));

  if (area.ring === null) {
    return deepFreeze({
      number: ticket.number,
      workArea: { source: area.source, radiusFeet: area.radiusFeet },
      districts: [],
      memberClaimed,
      ours: memberClaimed,
      hits: [],
      conflict: false,
      depthCleared: false,
      critical: false,
      clearReason: memberClaimed ? null : 'no geometry',
    });
  }

  const inDistricts = districtsForRing(districts, area.ring).map((district) => district.code);
  const ours = memberClaimed || inDistricts.length > 0 || districts.length === 0;
  const margin = policy.noticeMarginFeet;
  const found = network.intersecting(area.ring, feetToMetres(Math.max(0, margin)));

  const hits = [];
  for (const { facility, metres } of found) {
    if (facility.abandoned && !policy.reportAbandoned) continue;
    const feet = metresToFeet(metres);
    const hit = {
      facilityId: facility.id,
      type: facility.type,
      district: facility.district,
      metres,
      feet,
      toleranceFeet: toleranceFeetOf(facility),
      insideTolerance: metres <= toleranceMetresOf(facility),
      abandoned: facility.abandoned,
      critical: facilityType(facility.type).critical || facility.highConsequence,
    };
    hits.push(
      policy.checkDepth
        ? withDepth(hit, ticket, facility, { policy: policy.depth })
        : { ...hit, depthVerdict: 'unknown', depthReason: 'depth was not checked' }
    );
  }

  const live = hits.filter((hit) => !hit.abandoned);
  const conflict = live.some((hit) => hit.insideTolerance);
  const depthCleared = live
    .filter((hit) => hit.insideTolerance)
    .every((hit) => hit.depthVerdict === 'clear');
  return deepFreeze({
    number: ticket.number,
    workArea: { source: area.source, radiusFeet: area.radiusFeet },
    districts: inDistricts,
    memberClaimed,
    ours,
    hits,
    conflict,
    depthCleared: conflict && depthCleared,
    critical: live.some((hit) => hit.insideTolerance && hit.critical),
    clearReason: clearReasonFor({ ours, hits: live, conflict }),
  });
}

function clearReasonFor({ ours, hits, conflict }) {
  if (!ours) return 'outside district';
  if (hits.length === 0) return 'no facilities';
  if (!conflict) return 'outside tolerance';
  return null;
}

/** Screen a run of tickets, keeping the results in the order given. */
export function screenBatch(tickets, context) {
  return tickets.map((ticket) => screenTicket(ticket, context));
}

/** The facility types a screening found inside their tolerance zone. */
export function conflictingTypes(result) {
  const types = new Set();
  for (const hit of result.hits) {
    if (hit.insideTolerance && !hit.abandoned) types.add(hit.type);
  }
  return [...types].sort();
}

/** The closest live facility a screening found, or null. */
export function closestHit(result) {
  const live = result.hits.filter((hit) => !hit.abandoned);
  return live.length === 0 ? null : live[0];
}
