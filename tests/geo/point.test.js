import { describe, expect, it } from 'vitest';
import {
  GeometryError,
  point,
  toPoint,
  toRadians,
  toDegrees,
  metresToFeet,
  feetToMetres,
  distanceMetres,
  distanceFeet,
  bearingDegrees,
  destination,
  midpoint,
  samePlace,
  roundPoint,
} from '../../src/geo/point.js';

const DEPOT = { lat: 35.4676, lon: -97.5164 };

describe('point', () => {
  it('freezes what it returns', () => {
    const p = point(35.4676, -97.5164);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p).toEqual(DEPOT);
  });

  it('rejects coordinates that are not finite numbers', () => {
    expect(() => point('35', -97)).toThrow(GeometryError);
    expect(() => point(35, Number.NaN)).toThrow(/longitude must be/);
    expect(() => point(Number.POSITIVE_INFINITY, -97)).toThrow(/latitude must be/);
  });

  it('rejects coordinates off the globe', () => {
    expect(() => point(91, 0)).toThrow(/latitude is off/);
    expect(() => point(0, 181)).toThrow(/longitude is off/);
  });
});

describe('toPoint', () => {
  it('reads a lon lat pair', () => {
    expect(toPoint([-97.5164, 35.4676])).toEqual(DEPOT);
  });

  it('reads the long and the short property names', () => {
    expect(toPoint({ latitude: 35.4676, longitude: -97.5164 })).toEqual(DEPOT);
    expect(toPoint({ lat: 35.4676, lng: -97.5164 })).toEqual(DEPOT);
  });

  it('rejects a pair of the wrong length', () => {
    expect(() => toPoint([1, 2, 3])).toThrow(/exactly two/);
  });

  it('rejects a value it cannot read', () => {
    expect(() => toPoint('35.4,-97.5')).toThrow(/cannot read a point/);
    expect(() => toPoint(null)).toThrow(/cannot read a point/);
  });
});

describe('unit conversion', () => {
  it('converts angles', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 12);
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 12);
  });

  it('round trips feet and metres', () => {
    expect(metresToFeet(1)).toBeCloseTo(3.280839895, 8);
    expect(feetToMetres(metresToFeet(17.5))).toBeCloseTo(17.5, 10);
  });
});

describe('distance and bearing', () => {
  it('is zero for the same point', () => {
    expect(distanceMetres(DEPOT, DEPOT)).toBe(0);
  });

  it('measures a short hop', () => {
    const north = destination(DEPOT, 100, 0);
    expect(distanceMetres(DEPOT, north)).toBeCloseTo(100, 6);
    expect(distanceFeet(DEPOT, north)).toBeCloseTo(328.084, 3);
  });

  it('reads the bearing back', () => {
    expect(bearingDegrees(DEPOT, destination(DEPOT, 250, 90))).toBeCloseTo(90, 4);
    expect(bearingDegrees(DEPOT, destination(DEPOT, 250, 315))).toBeCloseTo(315, 4);
  });

  it('rejects a distance that is not a number', () => {
    expect(() => destination(DEPOT, 'far', 0)).toThrow(/finite number of metres/);
  });

  it('keeps longitude in range when crossing the antimeridian', () => {
    const near = point(0, 179.999);
    expect(destination(near, 500, 90).lon).toBeLessThan(0);
  });
});

describe('midpoint and samePlace', () => {
  it('lands halfway between two points', () => {
    const east = destination(DEPOT, 200, 90);
    const mid = midpoint(DEPOT, east);
    expect(distanceMetres(DEPOT, mid)).toBeCloseTo(100, 3);
    expect(distanceMetres(mid, east)).toBeCloseTo(100, 3);
  });

  it('treats near coincident points as the same place', () => {
    expect(samePlace(DEPOT, destination(DEPOT, 0.2, 45))).toBe(true);
    expect(samePlace(DEPOT, destination(DEPOT, 5, 45))).toBe(false);
    expect(samePlace(DEPOT, destination(DEPOT, 5, 45), 10)).toBe(true);
  });
});

describe('roundPoint', () => {
  it('trims to six places by default', () => {
    expect(roundPoint({ lat: 35.46761234, lon: -97.51639876 })).toEqual({
      lat: 35.467612,
      lon: -97.516399,
    });
  });

  it('honours a requested precision', () => {
    expect(roundPoint(DEPOT, 2)).toEqual({ lat: 35.47, lon: -97.52 });
  });
});
