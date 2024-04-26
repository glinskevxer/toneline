/**
 * Buffers.
 *
 * Most tickets do not arrive with a drawn work area, only a point or a run down
 * one side of a street, so the desk grows the geometry it does have into a ring
 * it can screen with. These are deliberately plain constructions: a disc around
 * a point and a corridor around a polyline, both good to within the width of a
 * paint line at the distances involved.
 */

import { GeometryError, bearingDegrees, destination, toPoint } from './point.js';
import { toPolyline } from './segment.js';

const DEFAULT_SEGMENTS = 24;

/** A ring approximating a circle of a given radius about a point. */
export function discRing(centre, metres, segments = DEFAULT_SEGMENTS) {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres <= 0) {
    throw new GeometryError('a disc needs a radius above zero', { metres });
  }
  if (!Number.isInteger(segments) || segments < 6) {
    throw new GeometryError('a disc needs at least six segments', { segments });
  }
  const origin = toPoint(centre);
  const ring = [];
  for (let i = 0; i < segments; i += 1) {
    ring.push(destination(origin, metres, (i * 360) / segments));
  }
  ring.push(ring[0]);
  return ring;
}

/**
 * A ring running a fixed distance either side of a polyline.
 *
 * The corridor is built by walking the line offsetting to the left, then
 * walking it backwards offsetting to the right, with a rounded cap at each end
 * so a short line still encloses real ground.
 */
export function corridorRing(polyline, halfWidthMetres, capSegments = 6) {
  const points = toPolyline(polyline);
  if (
    typeof halfWidthMetres !== 'number' ||
    !Number.isFinite(halfWidthMetres) ||
    halfWidthMetres <= 0
  ) {
    throw new GeometryError('a corridor needs a half width above zero', { halfWidthMetres });
  }
  if (!Number.isInteger(capSegments) || capSegments < 1) {
    throw new GeometryError('a corridor needs at least one cap segment', { capSegments });
  }
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i += 1) {
    const heading = headingAt(points, i);
    left.push(destination(points[i], halfWidthMetres, (heading + 270) % 360));
    right.push(destination(points[i], halfWidthMetres, (heading + 90) % 360));
  }
  const endHeading = headingAt(points, points.length - 1);
  const startHeading = headingAt(points, 0);
  const ring = [
    ...left,
    ...cap(points[points.length - 1], halfWidthMetres, endHeading + 270, capSegments),
    ...right.reverse(),
    ...cap(points[0], halfWidthMetres, startHeading + 90, capSegments),
  ];
  ring.push(ring[0]);
  return ring;
}

function headingAt(points, index) {
  if (index === 0) return bearingDegrees(points[0], points[1]);
  if (index === points.length - 1) {
    return bearingDegrees(points[points.length - 2], points[points.length - 1]);
  }
  return bearingDegrees(points[index - 1], points[index + 1]);
}

function cap(centre, metres, fromBearing, segments) {
  const arc = [];
  for (let i = 1; i < segments; i += 1) {
    arc.push(destination(centre, metres, (fromBearing + (180 * i) / segments + 360) % 360));
  }
  return arc;
}

/** A ring around whatever geometry the caller has, choosing the right shape. */
export function bufferGeometry(points, metres) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new GeometryError('nothing to buffer', { count: points?.length ?? 0 });
  }
  if (points.length === 1) return discRing(points[0], metres);
  return corridorRing(points, metres);
}
