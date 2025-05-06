/**
 * Where the work is.
 *
 * Counting tickets by district tells a manager which crew is busy. Counting
 * them by ground tells them where to put the next crew, which is a different
 * answer, so this bins tickets and damages onto a grid of cells and hands back
 * the cells rather than a picture.
 */

import { deepFreeze } from '../core/fields.js';
import { boundsOf, boundsUnion } from '../geo/bbox.js';
import { workAreaCentre } from '../ticket/site.js';

/** The cell size the map is binned onto, in degrees. */
export const DEFAULT_CELL_DEGREES = 0.01;

/** The key for the cell a point falls in. */
export function cellKey(point, cellDegrees = DEFAULT_CELL_DEGREES) {
  const lat = Math.floor(point.lat / cellDegrees);
  const lon = Math.floor(point.lon / cellDegrees);
  return `${lat}:${lon}`;
}

/** The bounds of a cell from its key. */
export function cellBounds(key, cellDegrees = DEFAULT_CELL_DEGREES) {
  const [lat, lon] = key.split(':').map(Number);
  return {
    south: lat * cellDegrees,
    west: lon * cellDegrees,
    north: (lat + 1) * cellDegrees,
    east: (lon + 1) * cellDegrees,
  };
}

/**
 * Bin a set of points onto the grid.
 *
 * @param {Array<{point: object, weight?: number}>} entries
 * @param {number} [cellDegrees]
 * @returns {Map<string, number>} the weight in each cell
 */
export function bin(entries, cellDegrees = DEFAULT_CELL_DEGREES) {
  const cells = new Map();
  for (const { point, weight = 1 } of entries) {
    if (point === null || point === undefined) continue;
    const key = cellKey(point, cellDegrees);
    cells.set(key, (cells.get(key) ?? 0) + weight);
  }
  return cells;
}

/**
 * The density of tickets and damages over the same grid.
 *
 * @param {object} args
 * @param {object[]} [args.tickets]
 * @param {object[]} [args.damages]
 * @param {number} [args.cellDegrees]
 */
export function densityMap({ tickets = [], damages = [], cellDegrees = DEFAULT_CELL_DEGREES }) {
  const ticketPoints = tickets
    .map((ticket) => workAreaCentre(ticket))
    .filter((point) => point !== null)
    .map((point) => ({ point }));
  const damagePoints = damages
    .filter((damage) => damage.point !== null)
    .map((damage) => ({ point: damage.point }));

  const ticketCells = bin(ticketPoints, cellDegrees);
  const damageCells = bin(damagePoints, cellDegrees);
  const keys = [...new Set([...ticketCells.keys(), ...damageCells.keys()])].sort();

  const cells = keys.map((key) => {
    const ticketCount = ticketCells.get(key) ?? 0;
    const damageCount = damageCells.get(key) ?? 0;
    return {
      key,
      bounds: cellBounds(key, cellDegrees),
      tickets: ticketCount,
      damages: damageCount,
      ratePerThousand: ticketCount === 0 ? 0 : (damageCount / ticketCount) * 1000,
    };
  });

  return deepFreeze({
    cellDegrees,
    cells,
    placed: ticketPoints.length,
    unplaced: tickets.length - ticketPoints.length,
    bounds: cells.length === 0 ? null : cells.map((cell) => cell.bounds).reduce(unionOf),
  });
}

function unionOf(left, right) {
  return boundsUnion(
    boundsOf([
      { lat: left.south, lon: left.west },
      { lat: left.north, lon: left.east },
    ]),
    boundsOf([
      { lat: right.south, lon: right.west },
      { lat: right.north, lon: right.east },
    ])
  );
}

/** The busiest cells, most tickets first. */
export function busiestCells(map, limit = 5) {
  return [...map.cells]
    .sort((left, right) => right.tickets - left.tickets || left.key.localeCompare(right.key))
    .slice(0, Math.max(0, limit));
}

/** The cells where damages are running above a rate, worst first. */
export function hotCells(map, ratePerThousand = 1) {
  return map.cells
    .filter((cell) => cell.damages > 0 && cell.ratePerThousand >= ratePerThousand)
    .sort(
      (left, right) =>
        right.ratePerThousand - left.ratePerThousand || left.key.localeCompare(right.key)
    );
}
