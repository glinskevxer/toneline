import { describe, expect, it } from 'vitest';
import {
  toLocal,
  toPolyline,
  pointToSegmentMetres,
  pointToPolyline,
  segmentLengthMetres,
  polylineLengthMetres,
  segmentsCross,
  polylineWithin,
} from '../../src/geo/segment.js';
import { GeometryError, destination } from '../../src/geo/point.js';

const ORIGIN = { lat: 35.4676, lon: -97.5164 };
const NORTH_100 = destination(ORIGIN, 100, 0);
const EAST_100 = destination(ORIGIN, 100, 90);

describe('toLocal', () => {
  it('puts the origin at zero', () => {
    expect(toLocal(ORIGIN, ORIGIN)).toEqual({ x: 0, y: 0 });
  });

  it('measures north as positive y and east as positive x', () => {
    expect(toLocal(ORIGIN, NORTH_100).y).toBeCloseTo(100, 1);
    expect(toLocal(ORIGIN, NORTH_100).x).toBeCloseTo(0, 6);
    expect(toLocal(ORIGIN, EAST_100).x).toBeCloseTo(100, 1);
  });
});

describe('toPolyline', () => {
  it('reads a run of points', () => {
    expect(toPolyline([ORIGIN, NORTH_100])).toHaveLength(2);
  });

  it('rejects anything shorter than two points', () => {
    expect(() => toPolyline([ORIGIN])).toThrow(GeometryError);
    expect(() => toPolyline(null)).toThrow(/at least two points/);
  });
});

describe('pointToSegmentMetres', () => {
  it('is zero on the segment', () => {
    expect(pointToSegmentMetres(ORIGIN, ORIGIN, NORTH_100)).toBeCloseTo(0, 6);
  });

  it('measures perpendicular offset from the middle', () => {
    const middle = destination(ORIGIN, 50, 0);
    const offset = destination(middle, 30, 90);
    expect(pointToSegmentMetres(offset, ORIGIN, NORTH_100)).toBeCloseTo(30, 1);
  });

  it('clamps past the ends of the segment', () => {
    const beyond = destination(NORTH_100, 40, 0);
    expect(pointToSegmentMetres(beyond, ORIGIN, NORTH_100)).toBeCloseTo(40, 1);
    const behind = destination(ORIGIN, 25, 180);
    expect(pointToSegmentMetres(behind, ORIGIN, NORTH_100)).toBeCloseTo(25, 1);
  });

  it('handles a segment of zero length', () => {
    expect(pointToSegmentMetres(EAST_100, ORIGIN, ORIGIN)).toBeCloseTo(100, 1);
  });
});

describe('pointToPolyline', () => {
  const run = [ORIGIN, NORTH_100, destination(NORTH_100, 100, 90)];

  it('names the closest segment', () => {
    const near = destination(NORTH_100, 60, 90);
    const result = pointToPolyline(near, run);
    expect(result.segment).toBe(1);
    expect(result.metres).toBeCloseTo(0, 0);
  });

  it('finds the first segment when the point sits beside it', () => {
    const near = destination(destination(ORIGIN, 20, 0), 15, 270);
    const result = pointToPolyline(near, run);
    expect(result.segment).toBe(0);
    expect(result.metres).toBeCloseTo(15, 0);
  });
});

describe('lengths', () => {
  it('measures a single segment', () => {
    expect(segmentLengthMetres(ORIGIN, NORTH_100)).toBeCloseTo(100, 1);
  });

  it('adds up a polyline', () => {
    expect(polylineLengthMetres([ORIGIN, NORTH_100, destination(NORTH_100, 100, 90)])).toBeCloseTo(
      200,
      1
    );
  });
});

describe('segmentsCross', () => {
  it('finds a plain crossing', () => {
    const west = destination(destination(ORIGIN, 50, 0), 50, 270);
    const east = destination(destination(ORIGIN, 50, 0), 50, 90);
    expect(segmentsCross(ORIGIN, NORTH_100, west, east)).toBe(true);
  });

  it('rejects a pair that misses', () => {
    const west = destination(destination(ORIGIN, 200, 0), 50, 270);
    const east = destination(destination(ORIGIN, 200, 0), 50, 90);
    expect(segmentsCross(ORIGIN, NORTH_100, west, east)).toBe(false);
  });

  it('counts a touching endpoint as a crossing', () => {
    expect(segmentsCross(ORIGIN, NORTH_100, NORTH_100, EAST_100)).toBe(true);
  });

  it('counts an overlapping collinear pair', () => {
    const half = destination(ORIGIN, 50, 0);
    const beyond = destination(ORIGIN, 150, 0);
    expect(segmentsCross(ORIGIN, NORTH_100, half, beyond)).toBe(true);
  });
});

describe('polylineWithin', () => {
  const run = [ORIGIN, NORTH_100];

  it('answers the proximity question', () => {
    const near = destination(destination(ORIGIN, 50, 0), 20, 90);
    expect(polylineWithin(near, run, 25)).toBe(true);
    expect(polylineWithin(near, run, 15)).toBe(false);
  });

  it('rejects a bad distance', () => {
    expect(() => polylineWithin(ORIGIN, run, -1)).toThrow(/at or above zero/);
  });
});
