import { describe, expect, it } from 'vitest';
import {
  TUNING_TARGETS,
  median,
  recommendCellDegrees,
  tunedNetwork,
  tuningAdvice,
} from '../../src/network/tuning.js';
import { FacilityNetwork, buildNetwork } from '../../src/network/network.js';
import { buildFacility } from '../../src/network/facility.js';
import { makeFacilities } from '../../src/testing/generate.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };

function built(records) {
  return records.map(buildFacility);
}

describe('median', () => {
  it('picks the middle of an odd list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the middle of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is zero for nothing', () => {
    expect(median([])).toBe(0);
  });
});

describe('recommendCellDegrees', () => {
  it('falls back to the smallest cell for an empty network', () => {
    expect(recommendCellDegrees([])).toBe(TUNING_TARGETS.minimumCellDegrees);
  });

  it('never recommends a cell smaller than a typical run', () => {
    const long = built([
      { id: 'F1', type: 'gas', path: [A, destination(A, 2000, 90)] },
      { id: 'F2', type: 'gas', path: [A, destination(A, 2000, 0)] },
    ]);
    expect(recommendCellDegrees(long)).toBeGreaterThan(0.01);
  });

  it('stays inside the bounds it was given', () => {
    const huge = built([{ id: 'F1', type: 'gas', path: [A, destination(A, 500000, 90)] }]);
    expect(recommendCellDegrees(huge)).toBe(TUNING_TARGETS.maximumCellDegrees);
  });

  it('recommends a bigger cell for a sparser network', () => {
    const dense = built(makeFacilities(400, { seed: 3, spacingMetres: 60 }));
    const sparse = built(makeFacilities(40, { seed: 3, spacingMetres: 600 }));
    expect(recommendCellDegrees(sparse)).toBeGreaterThan(recommendCellDegrees(dense));
  });

  it('gives the same answer for the same network', () => {
    const facilities = built(makeFacilities(80, { seed: 5 }));
    expect(recommendCellDegrees(facilities)).toBe(recommendCellDegrees(facilities));
  });
});

describe('tunedNetwork', () => {
  it('builds a network at the size it recommends', () => {
    const facilities = built(makeFacilities(120, { seed: 6 }));
    const { network, cellDegrees } = tunedNetwork(facilities);
    expect(network).toBeInstanceOf(FacilityNetwork);
    expect(network.size).toBe(120);
    expect(network.cellDegrees).toBe(cellDegrees);
  });

  it('finds the same plant as an untuned network', () => {
    const facilities = built(makeFacilities(120, { seed: 7 }));
    const { network } = tunedNetwork(facilities);
    const plain = buildNetwork(facilities);
    const here = facilities[10].path[0];
    expect(
      network
        .near(here, 50)
        .map((hit) => hit.facility.id)
        .sort()
    ).toEqual(
      plain
        .near(here, 50)
        .map((hit) => hit.facility.id)
        .sort()
    );
  });
});

describe('tuningAdvice', () => {
  it('says a tuned network is about right', () => {
    const facilities = built(makeFacilities(150, { seed: 8 }));
    const { network } = tunedNetwork(facilities);
    const advice = tuningAdvice(network);
    expect(advice.wellSized).toBe(true);
    expect(advice.advice).toMatch(/about right/);
  });

  it('says when the cells are too large', () => {
    const facilities = built(makeFacilities(150, { seed: 8 }));
    const wide = new FacilityNetwork({ cellDegrees: 0.05 });
    wide.addAll(facilities);
    expect(tuningAdvice(wide).advice).toMatch(/too large/);
  });

  it('says when the cells are too small', () => {
    const facilities = built(makeFacilities(150, { seed: 8, spacingMetres: 400 }));
    const tight = new FacilityNetwork({ cellDegrees: 0.0005 });
    tight.addAll(facilities);
    expect(tuningAdvice(tight).advice).toMatch(/too small/);
  });

  it('carries the index stats through', () => {
    const { network } = tunedNetwork(built(makeFacilities(60, { seed: 9 })));
    const advice = tuningAdvice(network);
    expect(advice.facilities).toBe(60);
    expect(advice.cells).toBeGreaterThan(0);
    expect(Object.isFrozen(advice)).toBe(true);
  });
});
