import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  bounds,
  boundsContain,
  boundsOverlap,
  boundsUnion,
  boundsCentre,
  expandBounds,
  boundsDiagonalMetres,
  boundsToRing,
} from '../../src/geo/bbox.js';
import { GeometryError } from '../../src/geo/point.js';

const BLOCK = bounds(35.46, -97.53, 35.47, -97.51);

describe('boundsOf', () => {
  it('wraps a set of points', () => {
    expect(
      boundsOf([{ lat: 35.47, lon: -97.53 }, { lat: 35.46, lon: -97.51 }, [-97.52, 35.465]])
    ).toEqual({ south: 35.46, west: -97.53, north: 35.47, east: -97.51 });
  });

  it('collapses to a single point', () => {
    const box = boundsOf([{ lat: 35.46, lon: -97.53 }]);
    expect(box.south).toBe(box.north);
    expect(box.west).toBe(box.east);
  });

  it('rejects an empty or missing list', () => {
    expect(() => boundsOf([])).toThrow(GeometryError);
    expect(() => boundsOf(null)).toThrow(/at least one point/);
  });
});

describe('bounds', () => {
  it('freezes what it returns', () => {
    expect(Object.isFrozen(BLOCK)).toBe(true);
  });

  it('rejects inverted edges', () => {
    expect(() => bounds(35.47, -97.53, 35.46, -97.51)).toThrow(/north edge below/);
    expect(() => bounds(35.46, -97.51, 35.47, -97.53)).toThrow(/east edge west of/);
  });

  it('rejects edges off the globe', () => {
    expect(() => bounds(-91, 0, 0, 1)).toThrow(/off the globe/);
  });
});

describe('containment and overlap', () => {
  it('includes the edges', () => {
    expect(boundsContain(BLOCK, { lat: 35.46, lon: -97.53 })).toBe(true);
    expect(boundsContain(BLOCK, { lat: 35.465, lon: -97.52 })).toBe(true);
    expect(boundsContain(BLOCK, { lat: 35.48, lon: -97.52 })).toBe(false);
    expect(boundsContain(BLOCK, { lat: 35.465, lon: -97.5 })).toBe(false);
  });

  it('detects touching and separated bounds', () => {
    expect(boundsOverlap(BLOCK, bounds(35.465, -97.52, 35.5, -97.4))).toBe(true);
    expect(boundsOverlap(BLOCK, bounds(35.47, -97.51, 35.5, -97.4))).toBe(true);
    expect(boundsOverlap(BLOCK, bounds(35.48, -97.53, 35.5, -97.51))).toBe(false);
    expect(boundsOverlap(BLOCK, bounds(35.46, -97.5, 35.47, -97.49))).toBe(false);
  });
});

describe('union and centre', () => {
  it('takes in both boxes', () => {
    expect(boundsUnion(BLOCK, bounds(35.4, -97.6, 35.42, -97.55))).toEqual({
      south: 35.4,
      west: -97.6,
      north: 35.47,
      east: -97.51,
    });
  });

  it('finds the centre', () => {
    const centre = boundsCentre(BLOCK);
    expect(centre.lat).toBeCloseTo(35.465, 9);
    expect(centre.lon).toBeCloseTo(-97.52, 9);
  });
});

describe('expandBounds', () => {
  it('grows every edge', () => {
    const grown = expandBounds(BLOCK, 100);
    expect(grown.south).toBeLessThan(BLOCK.south);
    expect(grown.north).toBeGreaterThan(BLOCK.north);
    expect(grown.west).toBeLessThan(BLOCK.west);
    expect(grown.east).toBeGreaterThan(BLOCK.east);
  });

  it('grows longitude further than latitude away from the equator', () => {
    const grown = expandBounds(BLOCK, 100);
    expect(grown.east - BLOCK.east).toBeGreaterThan(BLOCK.south - grown.south);
  });

  it('leaves the box alone when asked for nothing', () => {
    expect(expandBounds(BLOCK, 0)).toEqual(BLOCK);
  });

  it('clamps at the poles and the antimeridian', () => {
    const edge = expandBounds(bounds(-89.999, -179.999, 89.999, 179.999), 5000);
    expect(edge.south).toBe(-90);
    expect(edge.north).toBe(90);
    expect(edge.west).toBe(-180);
    expect(edge.east).toBe(180);
  });

  it('rejects a negative or unreadable distance', () => {
    expect(() => expandBounds(BLOCK, -1)).toThrow(/at or above zero/);
    expect(() => expandBounds(BLOCK, 'far')).toThrow(GeometryError);
  });
});

describe('reporting helpers', () => {
  it('measures the diagonal', () => {
    expect(boundsDiagonalMetres(BLOCK)).toBeGreaterThan(1800);
    expect(boundsDiagonalMetres(BLOCK)).toBeLessThan(2400);
  });

  it('renders a closed ring', () => {
    const ring = boundsToRing(BLOCK);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[2]).toEqual({ lat: 35.47, lon: -97.51 });
  });
});
