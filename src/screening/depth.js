/**
 * Depth.
 *
 * Plan distance is not the whole question. A bore running twelve feet down
 * under a service laid at three does not touch it, and an open cut to eight
 * feet beside a main at four does, even at the same offset. The desk cannot
 * know either depth exactly, so this works in bands and errs towards saying a
 * conflict exists.
 */

import { deepFreeze } from '../core/fields.js';
import { atOrAboveZero, definePolicy } from '../config/policies.js';

/** How much slack to allow on a recorded depth. */
export const DEFAULT_DEPTH_POLICY = Object.freeze({
  facilityToleranceFeet: 2,
  digToleranceFeet: 1,
  assumeDigFeet: 5,
  clearBoreSeparationFeet: 4,
});

/** Merge a partial depth policy over the defaults. */
export const depthPolicy = definePolicy(DEFAULT_DEPTH_POLICY, {
  facilityToleranceFeet: atOrAboveZero,
  digToleranceFeet: atOrAboveZero,
  assumeDigFeet: atOrAboveZero,
  clearBoreSeparationFeet: atOrAboveZero,
});

/**
 * Compare the depth of a dig with the depth of a facility.
 *
 * @param {object} args
 * @param {number|null} args.digFeet how deep the excavator says they are going
 * @param {boolean} args.boring whether the work is a bore rather than a cut
 * @param {number|null} args.facilityFeet the recorded depth of the facility
 * @param {object} [args.policy]
 * @returns {{verdict: string, reason: string}} one of `conflict`, `clear` or `unknown`
 */
export function compareDepth({ digFeet, boring, facilityFeet, policy = DEFAULT_DEPTH_POLICY }) {
  if (facilityFeet === null || facilityFeet === undefined) {
    return verdict('unknown', 'the facility has no recorded depth');
  }
  const dig = digFeet === null || digFeet === undefined ? policy.assumeDigFeet : digFeet;
  const assumed = digFeet === null || digFeet === undefined;
  const facilityTop = facilityFeet - policy.facilityToleranceFeet;
  const digBottom = dig + policy.digToleranceFeet;

  if (!boring) {
    if (digBottom < facilityTop) {
      return verdict(
        'clear',
        assumed
          ? 'an assumed cut stays above the facility, but no depth was given'
          : 'the cut stays above the facility'
      );
    }
    return verdict('conflict', 'the cut reaches the depth of the facility');
  }
  const separation = Math.abs(dig - facilityFeet);
  if (separation >= policy.clearBoreSeparationFeet) {
    return verdict(
      'clear',
      dig > facilityFeet
        ? 'the bore passes below the facility'
        : 'the bore passes above the facility'
    );
  }
  return verdict('conflict', 'the bore runs at the depth of the facility');
}

function verdict(result, reason) {
  return deepFreeze({ verdict: result, reason });
}

/**
 * Apply the depth question to a screening hit.
 *
 * A hit that is clear on depth is not dropped, because the marks still have to
 * go down. It is flagged, so the response text can say the crossing was checked
 * rather than leaving the excavator to guess.
 */
export function withDepth(hit, ticket, facility, options = {}) {
  const result = compareDepth({
    digFeet: ticket.depthFeet,
    boring: ticket.boring,
    facilityFeet: facility.depthFeet,
    policy: options.policy,
  });
  return { ...hit, depthVerdict: result.verdict, depthReason: result.reason };
}

/** The hits a depth check says are genuinely in the way. */
export function depthConflicts(hits) {
  return hits.filter(
    (hit) => hit.depthVerdict !== 'clear' && hit.insideTolerance && !hit.abandoned
  );
}

/** True when every hit inside the tolerance zone clears on depth. */
export function clearsOnDepth(hits) {
  const inZone = hits.filter((hit) => hit.insideTolerance && !hit.abandoned);
  return inZone.length > 0 && inZone.every((hit) => hit.depthVerdict === 'clear');
}
