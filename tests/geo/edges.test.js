import { describe, expect, it } from 'vitest';
import {
  bearingDegrees,
  destination,
  distanceFeet,
  distanceMetres,
  midpoint,
  point,
  roundPoint,
} from '../../src/geo/point.js';
import { boundsOf, boundsOverlap, expandBounds } from '../../src/geo/bbox.js';
import { pointToPolyline, pointToSegmentMetres, segmentsCross } from '../../src/geo/segment.js';
import { ringAreaSquareMetres, ringCentroid, ringContains, toRing } from '../../src/geo/polygon.js';
import { corridorRing, discRing } from '../../src/geo/buffer.js';

/**
 * The geometry is used over a few hundred metres in the middle of a city, so
 * the places it can go wrong are the ones nobody looks at: the poles, the line
 * where longitude wraps, shapes with no area, and distances so small the
 * floating point starts to show.
 */

describe('near the poles', () => {
  it('measures a short hop where the meridians converge', () => {
    const near = point(89.99, 0);
    expect(distanceMetres(near, destination(near, 100, 0))).toBeCloseTo(100, 3);
    expect(distanceMetres(near, destination(near, 100, 90))).toBeCloseTo(100, 3);
  });

  it('grows bounds without going off the globe', () => {
    const grown = expandBounds(boundsOf([point(89.999, 0)]), 5000);
    expect(grown.north).toBeLessThanOrEqual(90);
    expect(grown.south).toBeGreaterThanOrEqual(-90);
  });

  it('keeps a disc on the globe', () => {
    for (const vertex of discRing(point(89.9, 0), 200)) {
      expect(Math.abs(vertex.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(vertex.lon)).toBeLessThanOrEqual(180);
    }
  });
});

describe('where longitude wraps', () => {
  it('keeps a point in range when stepping east over the line', () => {
    const stepped = destination(point(0, 179.999), 500, 90);
    expect(stepped.lon).toBeLessThan(0);
    expect(stepped.lon).toBeGreaterThan(-180);
  });

  it('keeps a point in range when stepping west over the line', () => {
    const stepped = destination(point(0, -179.999), 500, 270);
    expect(stepped.lon).toBeGreaterThan(0);
  });

  it('measures the short way round rather than the long way', () => {
    const west = point(0, -179.999);
    const east = point(0, 179.999);
    expect(distanceMetres(west, east)).toBeLessThan(1000);
  });

  it('puts the midpoint on the short arc', () => {
    const mid = midpoint(point(0, -179.9), point(0, 179.9));
    expect(Math.abs(mid.lon)).toBeGreaterThan(179);
  });
});

describe('shapes with nothing in them', () => {
  it('measures a segment of no length', () => {
    const here = point(35.4676, -97.5164);
    expect(pointToSegmentMetres(here, here, here)).toBe(0);
  });

  it('measures a polyline that never moves', () => {
    const here = point(35.4676, -97.5164);
    const result = pointToPolyline(destination(here, 50, 0), [here, here, here]);
    expect(result.metres).toBeCloseTo(50, 1);
  });

  it('gives a collapsed ring no area and a sensible centre', () => {
    const line = [point(35.4676, -97.5164), point(35.4686, -97.5164), point(35.4696, -97.5164)];
    expect(ringAreaSquareMetres(line)).toBeCloseTo(0, 6);
    expect(ringCentroid(line).lon).toBeCloseTo(-97.5164, 9);
  });

  it('holds a point that sits on a collapsed ring', () => {
    const line = [point(35.4676, -97.5164), point(35.4686, -97.5164), point(35.4696, -97.5164)];
    expect(ringContains(line, point(35.4686, -97.5164))).toBe(true);
  });

  it('counts two segments meeting at a point as crossing', () => {
    const here = point(35.4676, -97.5164);
    const there = destination(here, 100, 90);
    const up = destination(there, 100, 0);
    expect(segmentsCross(here, there, there, up)).toBe(true);
    expect(segmentsCross(here, here, there, there)).toBe(false);
  });

  it('makes a corridor from a line that doubles back on itself', () => {
    const here = point(35.4676, -97.5164);
    const there = destination(here, 100, 90);
    const ring = corridorRing([here, there, here], 5);
    expect(toRing(ring).length).toBeGreaterThan(4);
  });
});

describe('very small and very large', () => {
  it('measures a millimetre without collapsing to zero', () => {
    const here = point(35.4676, -97.5164);
    expect(distanceMetres(here, destination(here, 0.001, 90))).toBeGreaterThan(0);
  });

  it('measures a quarter of the way round the world', () => {
    const metres = distanceMetres(point(0, 0), point(0, 90));
    expect(metres).toBeGreaterThan(1e7);
    expect(metres).toBeLessThan(1.1e7);
  });

  it('measures the same distance in feet', () => {
    const here = point(35.4676, -97.5164);
    const there = destination(here, 30.48, 90);
    expect(distanceFeet(here, there)).toBeCloseTo(100, 3);
  });

  it('bears the same way from either side of a small step', () => {
    const here = point(35.4676, -97.5164);
    const north = destination(here, 0.5, 0);
    expect(bearingDegrees(here, north)).toBeCloseTo(0, 2);
    expect(bearingDegrees(north, here)).toBeCloseTo(180, 2);
  });
});

describe('bounds that only just touch', () => {
  it('counts a shared edge as an overlap', () => {
    const left = boundsOf([point(0, 0), point(1, 1)]);
    const right = boundsOf([point(1, 1), point(2, 2)]);
    expect(boundsOverlap(left, right)).toBe(true);
  });

  it('does not count boxes that miss by nothing at all', () => {
    const left = boundsOf([point(0, 0), point(1, 1)]);
    const right = boundsOf([point(1.0000001, 1.0000001), point(2, 2)]);
    expect(boundsOverlap(left, right)).toBe(false);
  });

  it('rounds a point without moving it out of its box', () => {
    const here = point(35.46761234, -97.51639876);
    const box = boundsOf([here]);
    const rounded = roundPoint(here, 3);
    expect(Math.abs(rounded.lat - box.south)).toBeLessThan(0.001);
  });
});
