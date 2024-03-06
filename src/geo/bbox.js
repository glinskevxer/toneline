/**
 * Axis aligned bounds.
 *
 * Screening a ticket against a facility network starts with a cheap bounds test
 * and only then measures real distances, so bounds are built for every dig site
 * and every facility segment as they are loaded.
 */

import { GeometryError, METRES_PER_DEGREE_LAT, distanceMetres, point, toPoint } from './point.js';

/** Build bounds from one or more points. */
export function boundsOf(points) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new GeometryError('bounds need at least one point', { count: points?.length ?? 0 });
  }
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  for (const raw of points) {
    const p = toPoint(raw);
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
  }
  return Object.freeze({ south, west, north, east });
}

/** Validate a bounds object and return a frozen copy. */
export function bounds(south, west, north, east) {
  point(south, west);
  point(north, east);
  if (north < south) {
    throw new GeometryError('bounds have their north edge below their south edge', {
      south,
      north,
    });
  }
  if (east < west) {
    throw new GeometryError('bounds have their east edge west of their west edge', { west, east });
  }
  return Object.freeze({ south, west, north, east });
}

/** True when the point falls inside the bounds, edges included. */
export function boundsContain(box, value) {
  const p = toPoint(value);
  return p.lat >= box.south && p.lat <= box.north && p.lon >= box.west && p.lon <= box.east;
}

/** True when two bounds share any ground at all. */
export function boundsOverlap(left, right) {
  if (left.north < right.south || right.north < left.south) return false;
  if (left.east < right.west || right.east < left.west) return false;
  return true;
}

/** The smallest bounds holding both inputs. */
export function boundsUnion(left, right) {
  return bounds(
    Math.min(left.south, right.south),
    Math.min(left.west, right.west),
    Math.max(left.north, right.north),
    Math.max(left.east, right.east)
  );
}

/** The centre of the bounds. */
export function boundsCentre(box) {
  return point((box.south + box.north) / 2, (box.west + box.east) / 2);
}

/**
 * Grow bounds by a distance on the ground. Longitude degrees shrink towards the
 * poles, so the east and west edges are widened using the latitude furthest
 * from the equator, which errs towards a larger box and never a smaller one.
 */
export function expandBounds(box, metres) {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) {
    throw new GeometryError('bounds can only be grown by a distance at or above zero', { metres });
  }
  const latPad = metres / METRES_PER_DEGREE_LAT;
  const worstLat = Math.max(Math.abs(box.south), Math.abs(box.north));
  const scale = Math.max(Math.cos((worstLat * Math.PI) / 180), 1e-6);
  const lonPad = metres / (METRES_PER_DEGREE_LAT * scale);
  return bounds(
    Math.max(-90, box.south - latPad),
    Math.max(-180, box.west - lonPad),
    Math.min(90, box.north + latPad),
    Math.min(180, box.east + lonPad)
  );
}

/** The diagonal of the bounds in metres, a rough size for reporting. */
export function boundsDiagonalMetres(box) {
  return distanceMetres({ lat: box.south, lon: box.west }, { lat: box.north, lon: box.east });
}

/** The bounds as a closed ring, clockwise from the south west corner. */
export function boundsToRing(box) {
  return [
    point(box.south, box.west),
    point(box.north, box.west),
    point(box.north, box.east),
    point(box.south, box.east),
    point(box.south, box.west),
  ];
}
