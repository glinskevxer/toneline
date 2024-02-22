/**
 * Points on the ground.
 *
 * Dig sites and facility records both arrive as latitude and longitude in
 * decimal degrees. Distances in this domain are short, a few hundred metres at
 * most, but the tolerance zone is measured in feet and a sloppy conversion moves
 * a facility out of a dig site, so the spherical formulas are used in full.
 */

import { TonelineError } from '../core/errors.js';

const EARTH_RADIUS_M = 6371008.8;
const FEET_PER_METRE = 3.280839895013123;

/** Raised when coordinates or a shape cannot be used. */
export class GeometryError extends TonelineError {
  constructor(message, details = {}) {
    super('GEOMETRY_INVALID', message, details);
  }
}

/** Validate a point and return a frozen copy of it. */
export function point(lat, lon) {
  if (typeof lat !== 'number' || !Number.isFinite(lat)) {
    throw new GeometryError('latitude must be a finite number', { lat });
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon)) {
    throw new GeometryError('longitude must be a finite number', { lon });
  }
  if (lat < -90 || lat > 90) {
    throw new GeometryError('latitude is off the globe', { lat });
  }
  if (lon < -180 || lon > 180) {
    throw new GeometryError('longitude is off the globe', { lon });
  }
  return Object.freeze({ lat, lon });
}

/** Read a point out of whatever shape the caller has, including `[lon, lat]`. */
export function toPoint(value) {
  if (Array.isArray(value)) {
    if (value.length !== 2) {
      throw new GeometryError('a coordinate pair must have exactly two numbers', { value });
    }
    return point(value[1], value[0]);
  }
  if (value && typeof value === 'object') {
    const lat = value.lat ?? value.latitude;
    const lon = value.lon ?? value.lng ?? value.longitude;
    return point(lat, lon);
  }
  throw new GeometryError('cannot read a point from the value', { value });
}

/** Degrees to radians. */
export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Radians to degrees. */
export function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/** Metres to feet, the unit every tolerance rule is written in. */
export function metresToFeet(metres) {
  return metres * FEET_PER_METRE;
}

/** Feet to metres. */
export function feetToMetres(feet) {
  return feet / FEET_PER_METRE;
}

/** Great circle distance between two points in metres. */
export function distanceMetres(from, to) {
  const a = toPoint(from);
  const b = toPoint(to);
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const dPhi = toRadians(b.lat - a.lat);
  const dLambda = toRadians(b.lon - a.lon);
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great circle distance in feet. */
export function distanceFeet(from, to) {
  return metresToFeet(distanceMetres(from, to));
}

/** Initial bearing from one point to another, in degrees clockwise from north. */
export function bearingDegrees(from, to) {
  const a = toPoint(from);
  const b = toPoint(to);
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const dLambda = toRadians(b.lon - a.lon);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** The point a given distance and bearing away. */
export function destination(from, metres, bearing) {
  if (typeof metres !== 'number' || !Number.isFinite(metres)) {
    throw new GeometryError('distance must be a finite number of metres', { metres });
  }
  const origin = toPoint(from);
  const delta = metres / EARTH_RADIUS_M;
  const theta = toRadians(bearing);
  const phi1 = toRadians(origin.lat);
  const lambda1 = toRadians(origin.lon);
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  const lon = ((toDegrees(lambda2) + 540) % 360) - 180;
  return point(toDegrees(phi2), lon);
}

/** The midpoint of the shorter arc between two points. */
export function midpoint(from, to) {
  const a = toPoint(from);
  const b = toPoint(to);
  const phi1 = toRadians(a.lat);
  const phi2 = toRadians(b.lat);
  const dLambda = toRadians(b.lon - a.lon);
  const bx = Math.cos(phi2) * Math.cos(dLambda);
  const by = Math.cos(phi2) * Math.sin(dLambda);
  const lat = Math.atan2(
    Math.sin(phi1) + Math.sin(phi2),
    Math.sqrt((Math.cos(phi1) + bx) ** 2 + by ** 2)
  );
  const lon = toRadians(a.lon) + Math.atan2(by, Math.cos(phi1) + bx);
  return point(toDegrees(lat), ((toDegrees(lon) + 540) % 360) - 180);
}

/** True when two points are within the given number of metres of each other. */
export function samePlace(from, to, toleranceMetres = 0.5) {
  return distanceMetres(from, to) <= toleranceMetres;
}

/** Round a point to a fixed number of decimal places for stable output. */
export function roundPoint(value, places = 6) {
  const p = toPoint(value);
  const factor = 10 ** places;
  return point(Math.round(p.lat * factor) / factor, Math.round(p.lon * factor) / factor);
}
