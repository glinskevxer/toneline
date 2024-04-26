import { describe, expect, it } from 'vitest';
import { discRing, corridorRing, bufferGeometry } from '../../src/geo/buffer.js';
import { GeometryError, destination, distanceMetres } from '../../src/geo/point.js';
import { ringAreaSquareMetres, ringContains, toRing } from '../../src/geo/polygon.js';

const CENTRE = { lat: 35.4676, lon: -97.5164 };

describe('discRing', () => {
  it('closes the ring', () => {
    const ring = discRing(CENTRE, 30);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(25);
  });

  it('keeps every vertex at the radius', () => {
    for (const vertex of discRing(CENTRE, 30)) {
      expect(distanceMetres(CENTRE, vertex)).toBeCloseTo(30, 3);
    }
  });

  it('encloses its own centre', () => {
    expect(ringContains(discRing(CENTRE, 30), CENTRE)).toBe(true);
  });

  it('approaches the area of a circle', () => {
    const area = ringAreaSquareMetres(discRing(CENTRE, 30, 90));
    expect(area).toBeCloseTo(Math.PI * 900, -1);
  });

  it('rejects a bad radius or segment count', () => {
    expect(() => discRing(CENTRE, 0)).toThrow(GeometryError);
    expect(() => discRing(CENTRE, -1)).toThrow(/above zero/);
    expect(() => discRing(CENTRE, 30, 4)).toThrow(/six segments/);
    expect(() => discRing(CENTRE, 30, 12.5)).toThrow(/six segments/);
  });
});

describe('corridorRing', () => {
  const line = [CENTRE, destination(CENTRE, 200, 90)];

  it('closes the ring', () => {
    const ring = corridorRing(line, 8);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('encloses the line it was built from', () => {
    const ring = corridorRing(line, 8);
    expect(ringContains(ring, destination(CENTRE, 100, 90))).toBe(true);
  });

  it('reaches out to the half width and no further', () => {
    const ring = corridorRing(line, 8);
    const middle = destination(CENTRE, 100, 90);
    expect(ringContains(ring, destination(middle, 6, 0))).toBe(true);
    expect(ringContains(ring, destination(middle, 12, 0))).toBe(false);
  });

  it('covers roughly the area of the rectangle plus its caps', () => {
    const area = ringAreaSquareMetres(corridorRing(line, 8, 24));
    expect(area).toBeGreaterThan(200 * 16);
    expect(area).toBeLessThan(200 * 16 + Math.PI * 64 + 40);
  });

  it('turns a corner', () => {
    const bent = [
      CENTRE,
      destination(CENTRE, 100, 90),
      destination(destination(CENTRE, 100, 90), 100, 0),
    ];
    const ring = corridorRing(bent, 6);
    expect(toRing(ring).length).toBeGreaterThan(8);
    expect(ringContains(ring, destination(CENTRE, 50, 90))).toBe(true);
  });

  it('rejects a bad half width or cap', () => {
    expect(() => corridorRing(line, 0)).toThrow(/half width above zero/);
    expect(() => corridorRing(line, 8, 0)).toThrow(/one cap segment/);
    expect(() => corridorRing([CENTRE], 8)).toThrow(/at least two points/);
  });
});

describe('bufferGeometry', () => {
  it('makes a disc from one point', () => {
    expect(ringContains(bufferGeometry([CENTRE], 20), CENTRE)).toBe(true);
  });

  it('makes a corridor from a run', () => {
    const ring = bufferGeometry([CENTRE, destination(CENTRE, 100, 90)], 10);
    expect(ringContains(ring, destination(CENTRE, 50, 90))).toBe(true);
  });

  it('rejects nothing to work with', () => {
    expect(() => bufferGeometry([], 10)).toThrow(/nothing to buffer/);
    expect(() => bufferGeometry(null, 10)).toThrow(GeometryError);
  });
});
