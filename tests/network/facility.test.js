import { describe, expect, it } from 'vitest';
import {
  FacilityError,
  buildFacility,
  toleranceFeetOf,
  toleranceMetresOf,
  facilityBounds,
  facilityLengthMetres,
  distanceToFacility,
  insideToleranceZone,
  isMarkable,
  describeFacility,
} from '../../src/network/facility.js';
import { destination } from '../../src/geo/point.js';

const START = { lat: 35.4676, lon: -97.5164 };
const END = destination(START, 200, 90);

const RAW = {
  id: 'gm-4412',
  type: 'gas',
  member: 'OKGAS01',
  district: 'CENTRAL',
  path: [START, END],
  depthFeet: 3.5,
  diameterInches: 4,
  material: 'steel',
};

describe('buildFacility', () => {
  it('builds a frozen record with an upper case id', () => {
    const facility = buildFacility(RAW);
    expect(facility.id).toBe('GM-4412');
    expect(facility.type).toBe('GAS');
    expect(Object.isFrozen(facility)).toBe(true);
  });

  it('defaults the flags', () => {
    const facility = buildFacility(RAW);
    expect(facility.abandoned).toBe(false);
    expect(facility.highConsequence).toBe(false);
    expect(facility.toleranceFeet).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildFacility(null)).toThrow(FacilityError);
  });

  it('rejects a missing id or an unknown type', () => {
    expect(() => buildFacility({ ...RAW, id: '' })).toThrow(/id is required/);
    expect(() => buildFacility({ ...RAW, type: 'AIR' })).toThrow(/not one this operator carries/);
  });

  it('rejects a path that is too short', () => {
    expect(() => buildFacility({ ...RAW, path: [START] })).toThrow(/at least two points/);
    expect(() => buildFacility({ ...RAW, path: [] })).toThrow(/cannot be empty/);
  });

  it('rejects a bad install date or a negative tolerance', () => {
    expect(() => buildFacility({ ...RAW, installedOn: '15/03/2024' })).toThrow(/calendar date/);
    expect(() => buildFacility({ ...RAW, toleranceFeet: -1 })).toThrow(/cannot be negative/);
  });

  it('keeps an install date that reads', () => {
    expect(buildFacility({ ...RAW, installedOn: '1998-06-02' }).installedOn).toBe('1998-06-02');
  });
});

describe('tolerance', () => {
  it('takes the tolerance from the facility type', () => {
    expect(toleranceFeetOf(buildFacility(RAW))).toBe(18);
    expect(toleranceFeetOf(buildFacility({ ...RAW, type: 'PETROLEUM' }))).toBe(36);
  });

  it('lets the record override it', () => {
    expect(toleranceFeetOf(buildFacility({ ...RAW, toleranceFeet: 25 }))).toBe(25);
  });

  it('converts to metres', () => {
    expect(toleranceMetresOf(buildFacility(RAW))).toBeCloseTo(5.4864, 4);
  });
});

describe('geometry helpers', () => {
  const facility = buildFacility(RAW);

  it('measures the run', () => {
    expect(facilityLengthMetres(facility)).toBeCloseTo(200, 1);
  });

  it('grows the bounds by the tolerance zone', () => {
    const plain = facilityBounds(facility);
    const wider = facilityBounds(facility, 50);
    expect(wider.north).toBeGreaterThan(plain.north);
    expect(plain.north).toBeGreaterThan(START.lat);
  });

  it('measures out to a point beside the run', () => {
    const beside = destination(destination(START, 100, 90), 12, 0);
    expect(distanceToFacility(facility, beside)).toBeCloseTo(12, 0);
  });

  it('answers the tolerance zone question', () => {
    const close = destination(destination(START, 100, 90), 4, 0);
    const far = destination(destination(START, 100, 90), 9, 0);
    expect(insideToleranceZone(facility, close)).toBe(true);
    expect(insideToleranceZone(facility, far)).toBe(false);
  });
});

describe('reporting helpers', () => {
  it('marks a live facility and skips an abandoned one', () => {
    expect(isMarkable(buildFacility(RAW))).toBe(true);
    expect(isMarkable(buildFacility({ ...RAW, abandoned: 'Y' }))).toBe(false);
  });

  it('describes a facility', () => {
    expect(describeFacility(buildFacility(RAW))).toBe('GM-4412 4 inch steel natural gas');
  });

  it('leaves out what it does not know', () => {
    const bare = buildFacility({ id: 'x1', type: 'water', path: [START, END] });
    expect(describeFacility(bare)).toBe('X1 potable water');
  });
});
