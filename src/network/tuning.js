/**
 * Sizing the grid.
 *
 * The index has one number in it and the right value depends on how spread out
 * the network is and how big a dig site is. Too small and a screening walks a
 * hundred empty cells; too big and it measures every run in the city. This
 * works the size out from the network itself rather than leaving an operator to
 * guess.
 */

import { deepFreeze } from '../core/fields.js';
import { METRES_PER_DEGREE_LAT } from '../geo/point.js';
import { FacilityNetwork } from './network.js';
import { facilityLengthMetres } from './facility.js';

/** What a well sized grid looks like. */
export const TUNING_TARGETS = Object.freeze({
  runsPerCell: 8,
  minimumCellDegrees: 0.0005,
  maximumCellDegrees: 0.05,
});

/** The median of a list of numbers, zero for an empty list. */
export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Recommend a cell size for a set of facility records.
 *
 * The starting point is the typical run length, because a cell smaller than a
 * run puts that run in every cell it crosses and buys nothing. It is then
 * widened or narrowed towards the target occupancy and clamped to something
 * sensible.
 *
 * @param {object[]} facilities built facility records
 * @param {object} [targets]
 */
export function recommendCellDegrees(facilities, targets = TUNING_TARGETS) {
  if (facilities.length === 0) return targets.minimumCellDegrees;
  const lengths = facilities.map(facilityLengthMetres);
  const typicalMetres = Math.max(median(lengths), 25);
  const fromLength = typicalMetres / METRES_PER_DEGREE_LAT;

  const box = boundsAround(facilities);
  const spanDegrees = Math.max(box.north - box.south, box.east - box.west, 1e-6);
  const wantedCells = Math.max(1, facilities.length / targets.runsPerCell);
  const fromSpread = spanDegrees / Math.sqrt(wantedCells);

  const chosen = Math.max(fromLength, fromSpread);
  return Math.min(targets.maximumCellDegrees, Math.max(targets.minimumCellDegrees, round(chosen)));
}

function boundsAround(facilities) {
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  for (const facility of facilities) {
    for (const point of facility.path) {
      if (point.lat < south) south = point.lat;
      if (point.lat > north) north = point.lat;
      if (point.lon < west) west = point.lon;
      if (point.lon > east) east = point.lon;
    }
  }
  return { south, west, north, east };
}

function round(value) {
  const places = Math.max(0, -Math.floor(Math.log10(value)) + 1);
  const factor = 10 ** Math.min(8, places);
  return Math.round(value * factor) / factor;
}

/**
 * Build a network at the recommended size.
 *
 * @returns {{network: FacilityNetwork, cellDegrees: number}}
 */
export function tunedNetwork(facilities, targets = TUNING_TARGETS) {
  const cellDegrees = recommendCellDegrees(facilities, targets);
  const network = new FacilityNetwork({ cellDegrees });
  network.addAll(facilities);
  return { network, cellDegrees };
}

/**
 * Say how a network's current size compares with the recommendation.
 *
 * @param {FacilityNetwork} network
 */
export function tuningAdvice(network, targets = TUNING_TARGETS) {
  const stats = network.stats();
  const recommended = recommendCellDegrees(network.all(), targets);
  const ratio = stats.cellDegrees / recommended;
  let advice = 'the grid is about right';
  if (ratio > 2) advice = 'the cells are too large, so screening measures runs it need not';
  if (ratio < 0.5) advice = 'the cells are too small, so screening walks empty cells';
  return deepFreeze({
    ...stats,
    recommended,
    ratio,
    advice,
    wellSized: ratio >= 0.5 && ratio <= 2,
  });
}
