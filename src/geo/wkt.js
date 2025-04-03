/**
 * Well known text.
 *
 * The mapping side of the house speaks WKT, and a locate desk that cannot read
 * or write it ends up with somebody retyping coordinates. Only the three types
 * that come up here are handled, and the axis order is the one WKT actually
 * uses, which is longitude first and catches everybody out once.
 */

import { GeometryError, toPoint } from './point.js';
import { toRing } from './polygon.js';
import { toPolyline } from './segment.js';

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const PAIR = new RegExp(`^\\s*(${NUMBER})\\s+(${NUMBER})\\s*$`);

/** Read a `POINT` into a point. */
export function parseWktPoint(text) {
  const body = bodyOf(text, 'POINT');
  return pairToPoint(body);
}

/** Read a `LINESTRING` into a polyline. */
export function parseWktLine(text) {
  const body = bodyOf(text, 'LINESTRING');
  return toPolyline(body.split(',').map(pairToPoint));
}

/** Read the outer ring of a `POLYGON`. */
export function parseWktPolygon(text) {
  const body = bodyOf(text, 'POLYGON');
  const inner = body.trim();
  if (!inner.startsWith('(')) {
    throw new GeometryError('a polygon needs its ring in brackets', { text });
  }
  const close = inner.indexOf(')');
  if (close === -1) {
    throw new GeometryError('the polygon ring is not closed with a bracket', { text });
  }
  return toRing(inner.slice(1, close).split(',').map(pairToPoint));
}

/** Read whatever geometry the text holds. */
export function parseWkt(text) {
  const upper = String(text ?? '')
    .trim()
    .toUpperCase();
  if (upper.startsWith('POINT')) return { type: 'point', geometry: parseWktPoint(text) };
  if (upper.startsWith('LINESTRING')) return { type: 'line', geometry: parseWktLine(text) };
  if (upper.startsWith('POLYGON')) return { type: 'polygon', geometry: parseWktPolygon(text) };
  throw new GeometryError('that is not a geometry this desk reads', { text });
}

function bodyOf(text, keyword) {
  if (typeof text !== 'string') {
    throw new GeometryError('well known text must be a string', { type: typeof text });
  }
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith(keyword)) {
    throw new GeometryError(`the text is not a ${keyword.toLowerCase()}`, { text });
  }
  const open = trimmed.indexOf('(');
  const close = trimmed.lastIndexOf(')');
  if (open === -1 || close < open) {
    throw new GeometryError('the geometry is missing its brackets', { text });
  }
  return trimmed.slice(open + 1, close);
}

function pairToPoint(chunk) {
  const match = PAIR.exec(chunk);
  if (!match) {
    throw new GeometryError('a coordinate pair must be a longitude and a latitude', { chunk });
  }
  return toPoint({ lon: Number(match[1]), lat: Number(match[2]) });
}

/** Write a point as `POINT`. */
export function writeWktPoint(value, places = 6) {
  return `POINT (${pairText(value, places)})`;
}

/** Write a polyline as `LINESTRING`. */
export function writeWktLine(points, places = 6) {
  const line = toPolyline(points);
  return `LINESTRING (${line.map((point) => pairText(point, places)).join(', ')})`;
}

/** Write a ring as `POLYGON`, closing it if the caller did not. */
export function writeWktPolygon(ring, places = 6) {
  const closed = toRing(ring);
  return `POLYGON ((${closed.map((point) => pairText(point, places)).join(', ')}))`;
}

function pairText(value, places) {
  const point = toPoint(value);
  return `${trim(point.lon, places)} ${trim(point.lat, places)}`;
}

function trim(value, places) {
  return Number(value.toFixed(places)).toString();
}
