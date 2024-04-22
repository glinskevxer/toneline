import { describe, expect, it } from 'vitest';
import {
  DistrictError,
  buildDistrict,
  buildDistricts,
  districtContains,
  districtsAt,
  districtsForRing,
  isOurMember,
  memberCodes,
  districtByCode,
} from '../../src/network/district.js';

const CENTRAL = {
  code: 'central',
  name: 'Central district',
  boundary: [
    { lat: 35.44, lon: -97.56 },
    { lat: 35.48, lon: -97.56 },
    { lat: 35.48, lon: -97.5 },
    { lat: 35.44, lon: -97.5 },
  ],
  members: ['okgas01', 'okelec02'],
  crew: 'crew-a',
};

const NORTH = {
  code: 'NORTH',
  boundary: [
    { lat: 35.48, lon: -97.56 },
    { lat: 35.54, lon: -97.56 },
    { lat: 35.54, lon: -97.5 },
    { lat: 35.48, lon: -97.5 },
  ],
  members: ['OKGAS01'],
};

describe('buildDistrict', () => {
  it('upper cases the code and the members', () => {
    const district = buildDistrict(CENTRAL);
    expect(district.code).toBe('CENTRAL');
    expect(district.members).toEqual(['OKGAS01', 'OKELEC02']);
    expect(Object.isFrozen(district)).toBe(true);
  });

  it('names itself after the code when no name was given', () => {
    expect(buildDistrict(NORTH).name).toBe('NORTH');
  });

  it('accepts the boundary under either key', () => {
    const { boundary, ...rest } = CENTRAL;
    expect(buildDistrict({ ...rest, ring: boundary }).boundary).toHaveLength(5);
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildDistrict(null)).toThrow(DistrictError);
  });

  it('rejects a missing code', () => {
    expect(() => buildDistrict({ ...CENTRAL, code: '' })).toThrow(/code is required/);
  });

  it('rejects a boundary that is not a ring', () => {
    expect(() => buildDistrict({ ...CENTRAL, boundary: [] })).toThrow(/needs a boundary ring/);
  });
});

describe('buildDistricts', () => {
  it('builds a list', () => {
    expect(buildDistricts([CENTRAL, NORTH])).toHaveLength(2);
    expect(buildDistricts()).toEqual([]);
  });

  it('refuses a repeated code', () => {
    expect(() => buildDistricts([CENTRAL, CENTRAL])).toThrow(/share a code/);
  });
});

describe('containment', () => {
  const districts = buildDistricts([CENTRAL, NORTH]);

  it('places a point in its district', () => {
    expect(districtContains(districts[0], { lat: 35.46, lon: -97.53 })).toBe(true);
    expect(districtContains(districts[1], { lat: 35.46, lon: -97.53 })).toBe(false);
  });

  it('finds every district a point falls in', () => {
    expect(districtsAt(districts, { lat: 35.46, lon: -97.53 }).map((d) => d.code)).toEqual([
      'CENTRAL',
    ]);
    expect(districtsAt(districts, { lat: 35.2, lon: -97.53 })).toEqual([]);
  });

  it('puts a point on the shared edge in both districts', () => {
    expect(districtsAt(districts, { lat: 35.48, lon: -97.53 }).map((d) => d.code)).toEqual([
      'CENTRAL',
      'NORTH',
    ]);
  });
});

describe('districtsForRing', () => {
  const districts = buildDistricts([CENTRAL, NORTH]);

  it('finds the one district a small site sits in', () => {
    const site = [
      { lat: 35.46, lon: -97.53 },
      { lat: 35.461, lon: -97.53 },
      { lat: 35.461, lon: -97.529 },
      { lat: 35.46, lon: -97.529 },
    ];
    expect(districtsForRing(districts, site).map((d) => d.code)).toEqual(['CENTRAL']);
  });

  it('finds both when a site straddles the line', () => {
    const site = [
      { lat: 35.479, lon: -97.53 },
      { lat: 35.481, lon: -97.53 },
      { lat: 35.481, lon: -97.529 },
      { lat: 35.479, lon: -97.529 },
    ];
    expect(districtsForRing(districts, site).map((d) => d.code)).toEqual(['CENTRAL', 'NORTH']);
  });

  it('finds nothing for a site off the map', () => {
    const site = [
      { lat: 34.0, lon: -99.0 },
      { lat: 34.001, lon: -99.0 },
      { lat: 34.001, lon: -98.999 },
      { lat: 34.0, lon: -98.999 },
    ];
    expect(districtsForRing(districts, site)).toEqual([]);
  });

  it('finds a district wholly inside a very large site', () => {
    const site = [
      { lat: 35.0, lon: -98.0 },
      { lat: 36.0, lon: -98.0 },
      { lat: 36.0, lon: -97.0 },
      { lat: 35.0, lon: -97.0 },
    ];
    expect(districtsForRing(districts, site)).toHaveLength(2);
  });
});

describe('member codes', () => {
  const districts = buildDistricts([CENTRAL, NORTH]);

  it('says whether a code is ours', () => {
    expect(isOurMember(districts, 'okgas01')).toBe(true);
    expect(isOurMember(districts, 'CITYWTR')).toBe(false);
  });

  it('gathers every code once, sorted', () => {
    expect(memberCodes(districts)).toEqual(['OKELEC02', 'OKGAS01']);
  });

  it('looks a district up by code', () => {
    expect(districtByCode(districts, 'north').code).toBe('NORTH');
    expect(districtByCode(districts, 'south')).toBeNull();
  });
});
