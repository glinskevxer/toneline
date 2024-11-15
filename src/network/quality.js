/**
 * Plant data quality.
 *
 * A screening is only as good as the map behind it, and the map is maintained
 * by people. These are the checks worth running over an extract before it goes
 * anywhere near a ticket: geometry that cannot be right, records that contradict
 * each other, and the gaps that make a run unmarkable in practice.
 */

import { boundsDiagonalMetres, boundsOf } from '../geo/bbox.js';
import { segmentLengthMetres } from '../geo/segment.js';
import { facilityType } from '../ticket/types.js';
import { facilityLengthMetres } from './facility.js';

/** How far a run may reasonably stretch before it looks like bad data. */
export const DEFAULT_QUALITY_POLICY = Object.freeze({
  maxRunMetres: 5000,
  maxSegmentMetres: 2000,
  minRunMetres: 0.5,
  maxDepthFeet: 40,
  minDepthFeet: 0.5,
});

/** Merge a partial quality policy over the defaults. */
export function qualityPolicy(overrides = {}) {
  return Object.freeze({ ...DEFAULT_QUALITY_POLICY, ...overrides });
}

/**
 * Check one facility.
 *
 * @returns {string[]} one line per problem, empty when the record is sound
 */
export function checkFacility(facility, policy = DEFAULT_QUALITY_POLICY) {
  const problems = [];
  const length = facilityLengthMetres(facility);
  if (length < policy.minRunMetres) {
    problems.push('the run has almost no length');
  }
  if (length > policy.maxRunMetres) {
    problems.push(`the run is ${Math.round(length)} metres long, which looks like bad data`);
  }
  for (let i = 0; i < facility.path.length - 1; i += 1) {
    if (segmentLengthMetres(facility.path[i], facility.path[i + 1]) > policy.maxSegmentMetres) {
      problems.push(`segment ${i + 1} jumps further than a real run of plant`);
      break;
    }
  }
  if (facility.depthFeet !== null) {
    if (facility.depthFeet < policy.minDepthFeet)
      problems.push('the depth is too shallow to be real');
    if (facility.depthFeet > policy.maxDepthFeet) problems.push('the depth is deeper than we lay');
  }
  if (facility.abandoned && facility.highConsequence) {
    problems.push('an abandoned run cannot also be high consequence');
  }
  if (facility.member === null) problems.push('the run has no member code, so it cannot be routed');
  if (facility.district === null) problems.push('the run has no district, so nobody owns it');
  return problems;
}

/**
 * Check a whole network.
 *
 * @returns {{problems: Array<{id: string, problems: string[]}>, checked: number}}
 */
export function checkNetwork(network, policy = DEFAULT_QUALITY_POLICY) {
  const found = [];
  for (const facility of network.all()) {
    const problems = checkFacility(facility, policy);
    if (problems.length > 0) found.push({ id: facility.id, problems });
  }
  return { problems: found, checked: network.size };
}

/** Runs of the same type that lie on top of one another. */
export function duplicateRuns(network, metres = 1) {
  const all = network.all();
  const pairs = [];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      if (all[i].type !== all[j].type) continue;
      if (samePath(all[i], all[j], metres)) {
        pairs.push([all[i].id, all[j].id].sort());
      }
    }
  }
  return pairs;
}

function samePath(left, right, metres) {
  if (left.path.length !== right.path.length) return false;
  return left.path.every((point, index) => segmentLengthMetres(point, right.path[index]) <= metres);
}

/** A short profile of the network for the data owner. */
export function networkProfile(network) {
  const byType = {};
  let totalMetres = 0;
  let abandoned = 0;
  for (const facility of network.all()) {
    const label = facilityType(facility.type).code;
    byType[label] = (byType[label] ?? 0) + 1;
    totalMetres += facilityLengthMetres(facility);
    if (facility.abandoned) abandoned += 1;
  }
  const box = network.bounds();
  return {
    runs: network.size,
    byType,
    abandoned,
    totalMetres: Math.round(totalMetres),
    spreadMetres: box === null ? 0 : Math.round(boundsDiagonalMetres(box)),
    bounds:
      box === null
        ? null
        : boundsOf([
            { lat: box.south, lon: box.west },
            { lat: box.north, lon: box.east },
          ]),
  };
}
