import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_POLICY,
  qualityPolicy,
  checkFacility,
  checkNetwork,
  duplicateRuns,
  networkProfile,
} from '../../src/network/quality.js';
import { buildFacility } from '../../src/network/facility.js';
import { buildNetwork } from '../../src/network/network.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);

function facility(overrides = {}) {
  return buildFacility({
    id: 'GM-1',
    type: 'gas',
    member: 'CTG01',
    district: 'CENTRAL',
    path: [A, B],
    depthFeet: 3.5,
    ...overrides,
  });
}

describe('qualityPolicy', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_QUALITY_POLICY.maxRunMetres).toBe(5000);
    expect(qualityPolicy({ maxRunMetres: 100 }).minRunMetres).toBe(0.5);
  });
});

describe('checkFacility', () => {
  it('passes a sound record', () => {
    expect(checkFacility(facility())).toEqual([]);
  });

  it('catches a run with no length', () => {
    const tiny = facility({ path: [A, destination(A, 0.1, 90)] });
    expect(checkFacility(tiny)).toContain('the run has almost no length');
  });

  it('catches a run that stretches too far', () => {
    const long = facility({ path: [A, destination(A, 9000, 90)] });
    expect(checkFacility(long)[0]).toMatch(/which looks like bad data/);
  });

  it('catches a single segment that jumps', () => {
    const jump = facility({ path: [A, destination(A, 3000, 90)] });
    expect(checkFacility(jump, qualityPolicy({ maxRunMetres: 10000 }))).toContain(
      'segment 1 jumps further than a real run of plant'
    );
  });

  it('catches an impossible depth', () => {
    expect(checkFacility(facility({ depthFeet: 0.1 }))).toContain(
      'the depth is too shallow to be real'
    );
    expect(checkFacility(facility({ depthFeet: 90 }))).toContain('the depth is deeper than we lay');
  });

  it('says nothing about a record with no depth', () => {
    expect(checkFacility(facility({ depthFeet: null }))).toEqual([]);
  });

  it('catches a contradiction between the flags', () => {
    expect(checkFacility(facility({ abandoned: true, highConsequence: true }))).toContain(
      'an abandoned run cannot also be high consequence'
    );
  });

  it('catches a run with no owner', () => {
    const orphan = checkFacility(facility({ member: null, district: null }));
    expect(orphan).toContain('the run has no member code, so it cannot be routed');
    expect(orphan).toContain('the run has no district, so nobody owns it');
  });
});

describe('checkNetwork', () => {
  it('reports only the runs with problems', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', member: 'CTG01', district: 'CENTRAL', path: [A, B] },
      { id: 'GM-2', type: 'gas', path: [A, B] },
    ]);
    const result = checkNetwork(network);
    expect(result.checked).toBe(2);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].id).toBe('GM-2');
  });

  it('reports nothing on a clean network', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', member: 'CTG01', district: 'CENTRAL', path: [A, B] },
    ]);
    expect(checkNetwork(network).problems).toEqual([]);
  });
});

describe('duplicateRuns', () => {
  it('finds two runs of the same type lying on top of each other', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [A, B] },
      { id: 'GM-2', type: 'gas', path: [A, B] },
    ]);
    expect(duplicateRuns(network)).toEqual([['GM-1', 'GM-2']]);
  });

  it('leaves two runs of different types alone', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [A, B] },
      { id: 'WT-1', type: 'water', path: [A, B] },
    ]);
    expect(duplicateRuns(network)).toEqual([]);
  });

  it('leaves runs of different shapes alone', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [A, B] },
      { id: 'GM-2', type: 'gas', path: [A, destination(A, 150, 90), B] },
    ]);
    expect(duplicateRuns(network)).toEqual([]);
  });

  it('honours a wider tolerance', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [A, B] },
      { id: 'GM-2', type: 'gas', path: [destination(A, 3, 0), destination(B, 3, 0)] },
    ]);
    expect(duplicateRuns(network)).toEqual([]);
    expect(duplicateRuns(network, 5)).toEqual([['GM-1', 'GM-2']]);
  });
});

describe('networkProfile', () => {
  it('profiles what is in the ground', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [A, B] },
      { id: 'WT-1', type: 'water', abandoned: true, path: [A, B] },
    ]);
    const profile = networkProfile(network);
    expect(profile.runs).toBe(2);
    expect(profile.byType).toEqual({ GAS: 1, WATER: 1 });
    expect(profile.abandoned).toBe(1);
    expect(profile.totalMetres).toBe(600);
    expect(profile.spreadMetres).toBe(300);
  });

  it('profiles an empty network', () => {
    const profile = networkProfile(buildNetwork([]));
    expect(profile.runs).toBe(0);
    expect(profile.bounds).toBeNull();
    expect(profile.spreadMetres).toBe(0);
  });
});
