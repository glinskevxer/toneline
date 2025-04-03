import { describe, expect, it } from 'vitest';
import {
  parseWktPoint,
  parseWktLine,
  parseWktPolygon,
  parseWkt,
  writeWktPoint,
  writeWktLine,
  writeWktPolygon,
} from '../../src/geo/wkt.js';
import { GeometryError } from '../../src/geo/point.js';

const POINT = 'POINT (-97.5164 35.4676)';
const LINE = 'LINESTRING (-97.5164 35.4676, -97.5144 35.4676)';
const POLYGON =
  'POLYGON ((-97.5164 35.4676, -97.5144 35.4676, -97.5144 35.4696, -97.5164 35.4676))';

describe('parseWktPoint', () => {
  it('reads longitude first', () => {
    expect(parseWktPoint(POINT)).toEqual({ lat: 35.4676, lon: -97.5164 });
  });

  it('accepts lower case and extra space', () => {
    expect(parseWktPoint('  point ( -97.5164   35.4676 ) ')).toEqual({
      lat: 35.4676,
      lon: -97.5164,
    });
  });

  it('rejects a non string', () => {
    expect(() => parseWktPoint(null)).toThrow(GeometryError);
  });

  it('rejects the wrong keyword', () => {
    expect(() => parseWktPoint(LINE)).toThrow(/not a point/);
  });

  it('rejects missing brackets', () => {
    expect(() => parseWktPoint('POINT -97.5164 35.4676')).toThrow(/missing its brackets/);
  });

  it('rejects a pair that is not two numbers', () => {
    expect(() => parseWktPoint('POINT (west north)')).toThrow(/longitude and a latitude/);
  });

  it('rejects coordinates off the globe', () => {
    expect(() => parseWktPoint('POINT (-97.5164 95)')).toThrow(/off the globe/);
  });
});

describe('parseWktLine', () => {
  it('reads a run of points', () => {
    const line = parseWktLine(LINE);
    expect(line).toHaveLength(2);
    expect(line[0].lon).toBeCloseTo(-97.5164, 6);
  });

  it('rejects a line of one point', () => {
    expect(() => parseWktLine('LINESTRING (-97.5164 35.4676)')).toThrow(/at least two points/);
  });
});

describe('parseWktPolygon', () => {
  it('reads the outer ring and closes it', () => {
    const ring = parseWktPolygon(POLYGON);
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('rejects a polygon with no inner brackets', () => {
    expect(() => parseWktPolygon('POLYGON (-97.5164 35.4676)')).toThrow(/ring in brackets/);
  });

  it('rejects a ring that is not closed with a bracket', () => {
    expect(() => parseWktPolygon('POLYGON ((-97.5164 35.4676, -97.5144 35.4676')).toThrow(
      /missing its brackets/
    );
  });
});

describe('parseWkt', () => {
  it('reads whichever type it was given', () => {
    expect(parseWkt(POINT).type).toBe('point');
    expect(parseWkt(LINE).type).toBe('line');
    expect(parseWkt(POLYGON).type).toBe('polygon');
  });

  it('rejects a type it does not read', () => {
    expect(() => parseWkt('MULTIPOINT ((0 0))')).toThrow(/not a geometry this desk reads/);
    expect(() => parseWkt(null)).toThrow(GeometryError);
  });
});

describe('writing', () => {
  it('writes a point longitude first', () => {
    expect(writeWktPoint({ lat: 35.4676, lon: -97.5164 })).toBe(POINT);
  });

  it('trims trailing zeroes', () => {
    expect(writeWktPoint({ lat: 35.5, lon: -97.5 })).toBe('POINT (-97.5 35.5)');
  });

  it('honours a requested precision', () => {
    expect(writeWktPoint({ lat: 35.46761234, lon: -97.51639876 }, 2)).toBe('POINT (-97.52 35.47)');
  });

  it('round trips a line', () => {
    expect(writeWktLine(parseWktLine(LINE))).toBe(LINE);
  });

  it('round trips a polygon', () => {
    expect(writeWktPolygon(parseWktPolygon(POLYGON))).toBe(POLYGON);
  });

  it('closes a ring the caller left open', () => {
    const open = [
      { lat: 35.4676, lon: -97.5164 },
      { lat: 35.4676, lon: -97.5144 },
      { lat: 35.4696, lon: -97.5144 },
    ];
    expect(writeWktPolygon(open)).toBe(POLYGON);
  });
});
