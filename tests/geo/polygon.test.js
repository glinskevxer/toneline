import { describe, expect, it } from 'vitest';
import {
  toRing,
  ringBounds,
  ringContains,
  ringPerimeterMetres,
  ringAreaSquareMetres,
  ringAreaSquareFeet,
  ringCentroid,
  distanceToRingMetres,
  ringIntersectsPolyline,
} from '../../src/geo/polygon.js';
import { GeometryError, destination, distanceMetres } from '../../src/geo/point.js';

const SW = { lat: 35.46, lon: -97.53 };
const SQUARE = [
  SW,
  { lat: 35.462, lon: -97.53 },
  { lat: 35.462, lon: -97.5275 },
  { lat: 35.46, lon: -97.5275 },
];

describe('toRing', () => {
  it('closes an open ring', () => {
    const ring = toRing(SQUARE);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('leaves an already closed ring alone', () => {
    const ring = toRing([...SQUARE, SW]);
    expect(ring).toHaveLength(5);
  });

  it('rejects anything shorter than three points', () => {
    expect(() => toRing([SW, SW])).toThrow(GeometryError);
    expect(() => toRing(null)).toThrow(/at least three points/);
  });

  it('rejects three points that are really two', () => {
    expect(() => toRing([SW, { lat: 35.461, lon: -97.53 }, SW])).toThrow(/three distinct/);
  });
});

describe('ringBounds', () => {
  it('wraps the ring', () => {
    expect(ringBounds(SQUARE)).toEqual({
      south: 35.46,
      west: -97.53,
      north: 35.462,
      east: -97.5275,
    });
  });
});

describe('ringContains', () => {
  it('finds a point in the middle', () => {
    expect(ringContains(SQUARE, { lat: 35.461, lon: -97.529 })).toBe(true);
  });

  it('rejects a point outside', () => {
    expect(ringContains(SQUARE, { lat: 35.47, lon: -97.529 })).toBe(false);
    expect(ringContains(SQUARE, { lat: 35.461, lon: -97.54 })).toBe(false);
  });

  it('counts a point on the edge as inside', () => {
    expect(ringContains(SQUARE, { lat: 35.461, lon: -97.53 })).toBe(true);
    expect(ringContains(SQUARE, SW)).toBe(true);
  });

  it('handles a concave ring', () => {
    const notch = [
      { lat: 35.46, lon: -97.53 },
      { lat: 35.464, lon: -97.53 },
      { lat: 35.464, lon: -97.5275 },
      { lat: 35.462, lon: -97.5275 },
      { lat: 35.462, lon: -97.5288 },
      { lat: 35.46, lon: -97.5288 },
    ];
    expect(ringContains(notch, { lat: 35.461, lon: -97.5295 })).toBe(true);
    expect(ringContains(notch, { lat: 35.461, lon: -97.528 })).toBe(false);
  });
});

describe('measurements', () => {
  it('measures the perimeter', () => {
    const expected =
      2 * distanceMetres(SW, { lat: 35.462, lon: -97.53 }) +
      2 * distanceMetres(SW, { lat: 35.46, lon: -97.5275 });
    expect(ringPerimeterMetres(SQUARE)).toBeCloseTo(expected, 0);
  });

  it('measures the area', () => {
    const height = distanceMetres(SW, { lat: 35.462, lon: -97.53 });
    const width = distanceMetres(SW, { lat: 35.46, lon: -97.5275 });
    expect(ringAreaSquareMetres(SQUARE)).toBeCloseTo(height * width, -1);
  });

  it('reports the area in square feet', () => {
    expect(ringAreaSquareFeet(SQUARE)).toBeCloseTo(ringAreaSquareMetres(SQUARE) * 10.7639104, 2);
  });

  it('reads the same area whichever way the ring is wound', () => {
    const reversed = [...SQUARE].reverse();
    expect(ringAreaSquareMetres(reversed)).toBeCloseTo(ringAreaSquareMetres(SQUARE), 6);
  });
});

describe('ringCentroid', () => {
  it('lands in the middle of a rectangle', () => {
    const centre = ringCentroid(SQUARE);
    expect(centre.lat).toBeCloseTo(35.461, 5);
    expect(centre.lon).toBeCloseTo(-97.52875, 5);
  });

  it('falls back to the mean for a ring with no area', () => {
    const line = [
      { lat: 35.46, lon: -97.53 },
      { lat: 35.461, lon: -97.53 },
      { lat: 35.462, lon: -97.53 },
    ];
    expect(ringCentroid(line).lon).toBeCloseTo(-97.53, 9);
  });
});

describe('distanceToRingMetres', () => {
  it('is zero on the boundary', () => {
    expect(distanceToRingMetres(SQUARE, { lat: 35.461, lon: -97.53 })).toBeCloseTo(0, 3);
  });

  it('measures out to a nearby point', () => {
    const outside = destination({ lat: 35.461, lon: -97.53 }, 40, 270);
    expect(distanceToRingMetres(SQUARE, outside)).toBeCloseTo(40, 0);
  });
});

describe('ringIntersectsPolyline', () => {
  it('finds a line that ends inside', () => {
    expect(
      ringIntersectsPolyline(SQUARE, [
        { lat: 35.4, lon: -97.6 },
        { lat: 35.461, lon: -97.529 },
      ])
    ).toBe(true);
  });

  it('finds a line that passes straight through', () => {
    expect(
      ringIntersectsPolyline(SQUARE, [
        { lat: 35.461, lon: -97.54 },
        { lat: 35.461, lon: -97.52 },
      ])
    ).toBe(true);
  });

  it('rejects a line that misses entirely', () => {
    expect(
      ringIntersectsPolyline(SQUARE, [
        { lat: 35.47, lon: -97.54 },
        { lat: 35.47, lon: -97.52 },
      ])
    ).toBe(false);
  });
});
