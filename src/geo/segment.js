/**
 * Line work.
 *
 * A buried facility is recorded as a polyline and a dig site is a small area,
 * so almost every screening question is "how far is this point from that run of
 * pipe". Over the few hundred metres involved a local flat projection is exact
 * enough and far cheaper than repeated great circle work, so the helpers here
 * project into metres about a local origin and then do plane geometry.
 */

import { GeometryError, METRES_PER_DEGREE_LAT, toPoint, toRadians } from './point.js';

/** Project a point into metres east and north of a local origin. */
export function toLocal(origin, value) {
  const o = toPoint(origin);
  const p = toPoint(value);
  const scale = Math.cos(toRadians((o.lat + p.lat) / 2));
  return {
    x: (p.lon - o.lon) * METRES_PER_DEGREE_LAT * scale,
    y: (p.lat - o.lat) * METRES_PER_DEGREE_LAT,
  };
}

/** Read a polyline, rejecting anything with fewer than two points. */
export function toPolyline(values) {
  if (!Array.isArray(values) || values.length < 2) {
    throw new GeometryError('a polyline needs at least two points', {
      count: Array.isArray(values) ? values.length : 0,
    });
  }
  return values.map(toPoint);
}

/** Closest approach from a point to one segment, in metres. */
export function pointToSegmentMetres(value, start, end) {
  const origin = toPoint(start);
  const p = toLocal(origin, value);
  const a = { x: 0, y: 0 };
  const b = toLocal(origin, end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(p.x, p.y);
  }
  const t = Math.max(0, Math.min(1, (p.x * dx + p.y * dy) / lengthSquared));
  return Math.hypot(p.x - t * dx, p.y - t * dy);
}

/**
 * Closest approach from a point to a whole polyline.
 *
 * @returns {{metres: number, segment: number}} the distance and the index of
 *   the segment that produced it, counting from zero
 */
export function pointToPolyline(value, polyline) {
  const points = toPolyline(polyline);
  let best = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const metres = pointToSegmentMetres(value, points[i], points[i + 1]);
    if (metres < best) {
      best = metres;
      bestIndex = i;
    }
  }
  return { metres: best, segment: bestIndex };
}

/** Length of a segment in metres. */
export function segmentLengthMetres(start, end) {
  const local = toLocal(start, end);
  return Math.hypot(local.x, local.y);
}

/** Length of a whole polyline in metres. */
export function polylineLengthMetres(polyline) {
  const points = toPolyline(polyline);
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += segmentLengthMetres(points[i], points[i + 1]);
  }
  return total;
}

/** True when two segments cross or touch. */
export function segmentsCross(a1, a2, b1, b2) {
  const origin = toPoint(a1);
  const p = { x: 0, y: 0 };
  const q = toLocal(origin, a2);
  const r = toLocal(origin, b1);
  const s = toLocal(origin, b2);
  const d1 = cross(p, q, r);
  const d2 = cross(p, q, s);
  const d3 = cross(r, s, p);
  const d4 = cross(r, s, q);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p, q, r)) return true;
  if (d2 === 0 && onSegment(p, q, s)) return true;
  if (d3 === 0 && onSegment(r, s, p)) return true;
  if (d4 === 0 && onSegment(r, s, q)) return true;
  return false;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, c) {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** True when any segment of the polyline comes within the given distance. */
export function polylineWithin(value, polyline, metres) {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) {
    throw new GeometryError('a proximity test needs a distance at or above zero', { metres });
  }
  return pointToPolyline(value, polyline).metres <= metres;
}
