/**
 * Dig site areas.
 *
 * A ticket's work area is a ring of points, either drawn by the excavator or
 * derived from a street address and a stated extent. The ring is closed on the
 * way in so callers never have to care whether the first point was repeated.
 */

import { GeometryError, METRES_PER_DEGREE_LAT, toPoint } from './point.js';
import { boundsOf } from './bbox.js';
import {
  pointToPolyline,
  pointToSegmentMetres,
  polylineLengthMetres,
  segmentsCross,
  toLocal,
} from './segment.js';

/** Read a ring of points and close it, rejecting anything degenerate. */
export function toRing(values) {
  if (!Array.isArray(values) || values.length < 3) {
    throw new GeometryError('a ring needs at least three points', {
      count: Array.isArray(values) ? values.length : 0,
    });
  }
  const points = values.map(toPoint);
  const first = points[0];
  const last = points[points.length - 1];
  const closed = first.lat === last.lat && first.lon === last.lon ? points : [...points, first];
  if (closed.length < 4) {
    throw new GeometryError('a ring needs at least three distinct points', {
      count: closed.length,
    });
  }
  return closed;
}

/** Bounds of a ring. */
export function ringBounds(ring) {
  return boundsOf(toRing(ring));
}

/**
 * True when the point falls inside the ring. Ray casting on the local plane,
 * with points that land on an edge counted as inside so a facility sitting on
 * the boundary of a dig site is never screened out.
 */
export function ringContains(ring, value) {
  const closed = toRing(ring);
  const origin = closed[0];
  const target = toLocal(origin, value);
  let inside = false;
  for (let i = 0; i < closed.length - 1; i += 1) {
    if (pointToSegmentMetres(value, closed[i], closed[i + 1]) < 0.01) return true;
    const a = toLocal(origin, closed[i]);
    const b = toLocal(origin, closed[i + 1]);
    const straddles = a.y > target.y !== b.y > target.y;
    if (straddles) {
      const crossingX = ((b.x - a.x) * (target.y - a.y)) / (b.y - a.y) + a.x;
      if (target.x < crossingX) inside = !inside;
    }
  }
  return inside;
}

/** Perimeter of the ring in metres. */
export function ringPerimeterMetres(ring) {
  return polylineLengthMetres(toRing(ring));
}

/** Area of the ring in square metres, by the shoelace formula on the plane. */
export function ringAreaSquareMetres(ring) {
  const closed = toRing(ring);
  const origin = closed[0];
  let sum = 0;
  for (let i = 0; i < closed.length - 1; i += 1) {
    const a = toLocal(origin, closed[i]);
    const b = toLocal(origin, closed[i + 1]);
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Area of the ring in square feet, the unit dig sites are quoted in. */
export function ringAreaSquareFeet(ring) {
  return ringAreaSquareMetres(ring) * 10.763910416709722;
}

/** Centroid of the ring, falling back to the mean when the area is zero. */
export function ringCentroid(ring) {
  const closed = toRing(ring);
  const origin = closed[0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < closed.length - 1; i += 1) {
    const a = toLocal(origin, closed[i]);
    const b = toLocal(origin, closed[i + 1]);
    const step = a.x * b.y - b.x * a.y;
    area += step;
    cx += (a.x + b.x) * step;
    cy += (a.y + b.y) * step;
  }
  if (area === 0) {
    const meanLat = closed.reduce((sum, p) => sum + p.lat, 0) / closed.length;
    const meanLon = closed.reduce((sum, p) => sum + p.lon, 0) / closed.length;
    return toPoint({ lat: meanLat, lon: meanLon });
  }
  const factor = 1 / (3 * area);
  return localToPoint(origin, cx * factor, cy * factor);
}

function localToPoint(origin, x, y) {
  const lat = origin.lat + y / METRES_PER_DEGREE_LAT;
  const scale = Math.cos(((origin.lat + lat) / 2) * (Math.PI / 180));
  return toPoint({ lat, lon: origin.lon + x / (METRES_PER_DEGREE_LAT * scale) });
}

/** Shortest distance from a point to the ring boundary, in metres. */
export function distanceToRingMetres(ring, value) {
  return pointToPolyline(value, toRing(ring)).metres;
}

/** True when any part of the polyline falls inside or crosses the ring. */
export function ringIntersectsPolyline(ring, polyline) {
  const closed = toRing(ring);
  for (const p of polyline) {
    if (ringContains(closed, p)) return true;
  }
  for (let i = 0; i < polyline.length - 1; i += 1) {
    for (let j = 0; j < closed.length - 1; j += 1) {
      if (segmentsCross(polyline[i], polyline[i + 1], closed[j], closed[j + 1])) return true;
    }
  }
  return false;
}
