import { describe, expect, it } from 'vitest';
import {
  parsePath,
  formatPath,
  rowToFacility,
  readFacilityCsv,
  writeFacilityCsv,
} from '../../src/io/facilities.js';
import { FeedParseError } from '../../src/core/errors.js';

const CSV = [
  'id,type,member,district,path,depth_ft,diameter_in,material,abandoned',
  'GM-1,gas,OKGAS01,CENTRAL,35.4676 -97.5164;35.4676 -97.5142,3.5,4,steel,N',
  'WT-9,water,CITYWTR,CENTRAL,35.4680 -97.5164;35.4680 -97.5142,5,8,ductile iron,Y',
].join('\n');

describe('parsePath', () => {
  it('reads pairs separated by a semicolon', () => {
    expect(parsePath('35.4676 -97.5164;35.4680 -97.5150')).toEqual([
      { lat: 35.4676, lon: -97.5164 },
      { lat: 35.468, lon: -97.515 },
    ]);
  });

  it('reads a pipe as a separator and a comma inside a pair', () => {
    expect(parsePath('35.4676,-97.5164|35.4680,-97.5150')).toHaveLength(2);
  });

  it('ignores an empty chunk from a trailing separator', () => {
    expect(parsePath('35.4676 -97.5164;35.4680 -97.5150;')).toHaveLength(2);
  });

  it('rejects an empty column', () => {
    expect(() => parsePath('')).toThrow(FeedParseError);
    expect(() => parsePath(null)).toThrow(/cannot be empty/);
  });

  it('rejects a chunk that is not a pair', () => {
    expect(() => parsePath('35.4676;35.4680 -97.5150')).toThrow(/latitude and a longitude/);
  });

  it('rejects a path of one point', () => {
    expect(() => parsePath('35.4676 -97.5164')).toThrow(/at least two points/);
  });
});

describe('formatPath', () => {
  it('round trips', () => {
    const path = parsePath('35.4676 -97.5164;35.468 -97.515');
    expect(parsePath(formatPath(path))).toEqual(path);
  });
});

describe('rowToFacility', () => {
  it('reads the extract column names', () => {
    const facility = rowToFacility({
      id: 'gm-1',
      type: 'gas',
      path: '35.4676 -97.5164;35.4680 -97.5150',
      depth_ft: '3.5',
      diameter_in: '4',
      abandoned: 'N',
    });
    expect(facility.id).toBe('GM-1');
    expect(facility.depthFeet).toBe(3.5);
    expect(facility.abandoned).toBe(false);
  });

  it('reads the alternative column names', () => {
    const facility = rowToFacility({
      facility_id: 'gm-2',
      facility_type: 'electric',
      geometry: '35.4676 -97.5164;35.4680 -97.5150',
    });
    expect(facility.id).toBe('GM-2');
    expect(facility.type).toBe('ELECTRIC');
  });

  it('carries the flags and the overrides', () => {
    const facility = rowToFacility({
      id: 'pl-1',
      type: 'petroleum',
      path: '35.4676 -97.5164;35.4680 -97.5150',
      high_consequence: 'Y',
      tolerance_ft: '40',
      installed_on: '1998-06-02',
      note: 'crosses the creek',
    });
    expect(facility.highConsequence).toBe(true);
    expect(facility.toleranceFeet).toBe(40);
    expect(facility.installedOn).toBe('1998-06-02');
    expect(facility.note).toBe('crosses the creek');
  });
});

describe('readFacilityCsv', () => {
  it('reads every row', () => {
    const { facilities, failures } = readFacilityCsv(CSV);
    expect(facilities.map((f) => f.id)).toEqual(['GM-1', 'WT-9']);
    expect(facilities[1].abandoned).toBe(true);
    expect(failures).toEqual([]);
  });

  it('names the row a failure came from', () => {
    const bad = `${CSV}\nBAD-1,gas,,,not a path,,,,N`;
    try {
      readFacilityCsv(bad);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.row).toBe(4);
      expect(err.details.reason).toMatch(/latitude and a longitude/);
    }
  });

  it('collects failures when asked to', () => {
    const bad = `${CSV}\nBAD-1,gas,,,not a path,,,,N`;
    const { facilities, failures } = readFacilityCsv(bad, { skipBad: true });
    expect(facilities).toHaveLength(2);
    expect(failures[0].row).toBe(4);
  });

  it('reads an empty file as nothing', () => {
    expect(readFacilityCsv('')).toEqual({ facilities: [], failures: [] });
  });
});

describe('writeFacilityCsv', () => {
  it('round trips through readFacilityCsv', () => {
    const { facilities } = readFacilityCsv(CSV);
    const again = readFacilityCsv(writeFacilityCsv(facilities)).facilities;
    expect(again).toEqual(facilities);
  });

  it('writes the header even with no rows', () => {
    expect(writeFacilityCsv([]).split('\n')[0]).toContain('id,type,member');
  });
});
