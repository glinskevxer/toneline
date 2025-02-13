/**
 * Trends.
 *
 * A single month's numbers say almost nothing on their own. These put a run of
 * periods side by side and answer the two questions that follow: which way is
 * it going, and is the move big enough to be worth talking about.
 */

import { deepFreeze } from '../core/fields.js';

/** Build a series of points from period records. */
export function series(records, key) {
  return records.map((record) => ({ period: record.period, value: Number(record[key] ?? 0) }));
}

/** The change from the first point to the last. */
export function change(points) {
  if (points.length < 2) return 0;
  return points[points.length - 1].value - points[0].value;
}

/** The average of a series. */
export function average(points) {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

/**
 * The slope of a least squares line through the series.
 *
 * Periods are treated as evenly spaced, which they are for months, and the
 * slope comes back in units per period so it can be read as "half a ticket a
 * month" rather than as a correlation nobody can act on.
 */
export function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = average(points);
  let top = 0;
  let bottom = 0;
  points.forEach((point, index) => {
    top += (index - meanX) * (point.value - meanY);
    bottom += (index - meanX) ** 2;
  });
  return bottom === 0 ? 0 : top / bottom;
}

/** Which way the series is going, with a dead band around flat. */
export function direction(points, deadBand = 0) {
  const moved = slope(points);
  if (Math.abs(moved) <= deadBand) return 'flat';
  return moved > 0 ? 'rising' : 'falling';
}

/**
 * Describe a trend.
 *
 * @param {object[]} records period records, oldest first
 * @param {string} key the field to trend
 * @param {object} [options]
 * @param {number} [options.deadBand] how much movement counts as flat
 * @param {boolean} [options.lowerIsBetter] whether falling is good news
 */
export function trend(records, key, options = {}) {
  const { deadBand = 0, lowerIsBetter = false } = options;
  const points = series(records, key);
  const way = direction(points, deadBand);
  const better = way === 'flat' ? null : (way === 'falling') === lowerIsBetter;
  return deepFreeze({
    key,
    points,
    periods: points.length,
    first: points.length === 0 ? null : points[0].value,
    last: points.length === 0 ? null : points[points.length - 1].value,
    change: change(points),
    average: average(points),
    slope: slope(points),
    direction: way,
    better,
  });
}

/** The worst period in a series, by the direction that matters. */
export function worstPeriod(points, { lowerIsBetter = false } = {}) {
  if (points.length === 0) return null;
  return points.reduce((worst, point) => {
    const isWorse = lowerIsBetter ? point.value > worst.value : point.value < worst.value;
    return isWorse ? point : worst;
  }, points[0]);
}

/** A one line summary a manager can read at a glance. */
export function trendLine(result) {
  if (result.periods === 0) return `${result.key}: nothing to trend`;
  const way =
    result.direction === 'flat' ? 'flat' : `${result.direction} ${format(result.slope)} a period`;
  return `${result.key}: ${format(result.first)} to ${format(result.last)}, ${way}`;
}

function format(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
