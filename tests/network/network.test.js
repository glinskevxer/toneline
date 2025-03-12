import { describe, expect, it } from 'vitest';
import { FacilityNetwork, buildNetwork } from '../../src/network/network.js';
import { FacilityError, buildFacility } from '../../src/network/facility.js';
import { destination } from '../../src/geo/point.js';
import { boundsOf } from '../../src/geo/bbox.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);
const FAR = { lat: 35.6, lon: -97.3 };

const RECORDS = [
  { id: 'GM-1', type: 'gas', district: 'central', member: 'OKGAS01', path: [A, B] },
  {
    id: 'EL-1',
    type: 'electric',
    district: 'central',
    path: [destination(A, 30, 0), destination(B, 30, 0)],
  },
  { id: 'WT-1', type: 'water', district: 'north', path: [FAR, destination(FAR, 200, 90)] },
];

describe('FacilityNetwork', () => {
  it('rejects a bad cell size', () => {
    expect(() => new FacilityNetwork({ cellDegrees: 0 })).toThrow(FacilityError);
    expect(() => new FacilityNetwork({ cellDegrees: 'wide' })).toThrow(/positive number/);
  });

  it('counts what it holds', () => {
    expect(buildNetwork(RECORDS).size).toBe(3);
    expect(buildNetwork([]).size).toBe(0);
    expect(buildNetwork().size).toBe(0);
  });

  it('accepts an already built facility', () => {
    const network = new FacilityNetwork();
    const built = buildFacility(RECORDS[0]);
    expect(network.add(built)).toBe(built);
  });

  it('refuses a repeated id', () => {
    const network = buildNetwork(RECORDS);
    expect(() => network.add(RECORDS[0])).toThrow(/already carries that facility id/);
  });

  it('looks a facility up by id in any case', () => {
    const network = buildNetwork(RECORDS);
    expect(network.get('gm-1').type).toBe('GAS');
    expect(network.get('nothing')).toBeNull();
  });

  it('filters by type and district', () => {
    const network = buildNetwork(RECORDS);
    expect(network.byType('gas').map((f) => f.id)).toEqual(['GM-1']);
    expect(network.byDistrict('CENTRAL').map((f) => f.id)).toEqual(['GM-1', 'EL-1']);
    expect(network.byDistrict('south')).toEqual([]);
  });

  it('reports the bounds of everything it holds', () => {
    const network = buildNetwork(RECORDS);
    const box = network.bounds();
    expect(box.south).toBeCloseTo(A.lat, 4);
    expect(box.north).toBeCloseTo(FAR.lat, 4);
    expect(buildNetwork([]).bounds()).toBeNull();
  });
});

describe('near', () => {
  const network = buildNetwork(RECORDS);

  it('finds the runs beside a point, nearest first', () => {
    const middle = destination(A, 150, 90);
    const hits = network.near(middle, 50);
    expect(hits.map((hit) => hit.facility.id)).toEqual(['GM-1', 'EL-1']);
    expect(hits[0].metres).toBeCloseTo(0, 1);
    expect(hits[1].metres).toBeCloseTo(30, 0);
  });

  it('honours the radius', () => {
    const middle = destination(A, 150, 90);
    expect(network.near(middle, 10).map((hit) => hit.facility.id)).toEqual(['GM-1']);
  });

  it('finds nothing far away', () => {
    expect(network.near({ lat: 35.2, lon: -97.9 }, 100)).toEqual([]);
  });

  it('rejects a bad radius', () => {
    expect(() => network.near(A, -5)).toThrow(/at or above zero/);
  });
});

describe('within', () => {
  const network = buildNetwork(RECORDS);

  it('returns the runs overlapping a box', () => {
    const box = { south: 35.467, west: -97.517, north: 35.4685, east: -97.5145 };
    expect(
      network
        .within(box)
        .map((f) => f.id)
        .sort()
    ).toEqual(['EL-1', 'GM-1']);
  });

  it('returns nothing for an empty patch', () => {
    expect(network.within({ south: 35.1, west: -98.1, north: 35.2, east: -98.0 })).toEqual([]);
  });
});

describe('intersecting', () => {
  const network = buildNetwork(RECORDS);
  const middle = destination(A, 150, 90);

  function ringAround(centre, metres) {
    return [
      destination(destination(centre, metres, 0), metres, 270),
      destination(destination(centre, metres, 0), metres, 90),
      destination(destination(centre, metres, 180), metres, 90),
      destination(destination(centre, metres, 180), metres, 270),
    ];
  }

  it('finds a run that passes through the site', () => {
    const hits = network.intersecting(ringAround(middle, 10));
    expect(hits.map((hit) => hit.facility.id)).toContain('GM-1');
  });

  it('finds a run just outside but inside its tolerance zone', () => {
    const hits = network.intersecting(ringAround(middle, 26));
    expect(hits.map((hit) => hit.facility.id).sort()).toEqual(['EL-1', 'GM-1']);
  });

  it('leaves out a run that is well clear', () => {
    const hits = network.intersecting(ringAround(middle, 5));
    expect(hits.map((hit) => hit.facility.id)).not.toContain('WT-1');
  });

  it('widens the reach when asked', () => {
    const tight = network.intersecting(ringAround(middle, 3));
    const wide = network.intersecting(ringAround(middle, 3), 40);
    expect(wide.length).toBeGreaterThan(tight.length);
  });
});

describe('remove and replace', () => {
  it('takes a run out of the index as well as the map', () => {
    const network = buildNetwork(RECORDS);
    const removed = network.remove('gm-1');
    expect(removed.id).toBe('GM-1');
    expect(network.size).toBe(2);
    expect(network.get('GM-1')).toBeNull();
    expect(network.near(destination(A, 150, 90), 20).map((hit) => hit.facility.id)).toEqual([]);
  });

  it('removes nothing it does not hold', () => {
    const network = buildNetwork(RECORDS);
    expect(network.remove('ZZ-9')).toBeNull();
    expect(network.size).toBe(3);
  });

  it('swaps a run for a new version of itself', () => {
    const network = buildNetwork(RECORDS);
    network.replace({
      id: 'GM-1',
      type: 'gas',
      path: [destination(A, 500, 0), destination(B, 500, 0)],
    });
    expect(network.size).toBe(3);
    expect(network.near(destination(A, 150, 90), 40).map((hit) => hit.facility.id)).toEqual([
      'EL-1',
    ]);
    expect(
      network.near(destination(destination(A, 500, 0), 150, 90), 20).map((hit) => hit.facility.id)
    ).toEqual(['GM-1']);
  });

  it('takes an already built facility to replace with', () => {
    const network = buildNetwork(RECORDS);
    const built = buildFacility({ id: 'GM-1', type: 'gas', abandoned: true, path: [A, B] });
    expect(network.replace(built).abandoned).toBe(true);
  });
});

describe('the bounds cache', () => {
  it('remembers the bounds of every run it holds', () => {
    const network = buildNetwork(RECORDS);
    expect(network.boundsOfFacility('gm-1')).toEqual(boundsOf([A, B]));
    expect(network.boundsOfFacility('nothing')).toBeNull();
  });

  it('forgets them again when a run is removed', () => {
    const network = buildNetwork(RECORDS);
    network.remove('GM-1');
    expect(network.boundsOfFacility('GM-1')).toBeNull();
    expect(network.boxes.size).toBe(2);
    expect(network.paddedBoxes.size).toBe(2);
  });

  it('replaces them when a run moves', () => {
    const network = buildNetwork(RECORDS);
    const moved = destination(A, 900, 0);
    network.replace({ id: 'GM-1', type: 'gas', path: [moved, destination(moved, 200, 90)] });
    expect(network.boundsOfFacility('GM-1').south).toBeCloseTo(moved.lat, 6);
    expect(network.boxes.size).toBe(3);
  });

  it('keeps the whole network bounds in step with the cache', () => {
    const network = buildNetwork(RECORDS);
    const before = network.bounds();
    network.remove('WT-1');
    const after = network.bounds();
    expect(after.north).toBeLessThan(before.north);
  });

  it('leaves no stale cell behind after a remove', () => {
    const network = buildNetwork(RECORDS);
    const cellsBefore = network.cells.size;
    network.remove('GM-1');
    network.remove('EL-1');
    network.remove('WT-1');
    expect(network.cells.size).toBeLessThan(cellsBefore);
    expect(network.cells.size).toBe(0);
  });
});

describe('index stats', () => {
  it('reports how the grid is sitting', () => {
    const network = buildNetwork(RECORDS);
    const stats = network.stats();
    expect(stats.facilities).toBe(3);
    expect(stats.cells).toBeGreaterThan(0);
    expect(stats.entries).toBeGreaterThanOrEqual(stats.facilities);
    expect(stats.averagePerCell).toBeGreaterThan(0);
    expect(stats.cellDegrees).toBe(0.005);
  });

  it('reports an empty index without dividing by zero', () => {
    expect(buildNetwork([]).stats()).toEqual({
      facilities: 0,
      cells: 0,
      entries: 0,
      averagePerCell: 0,
      worstCell: 0,
      cellDegrees: 0.005,
    });
  });

  it('puts more runs in each cell as the cells grow', () => {
    const tight = new FacilityNetwork({ cellDegrees: 0.001 });
    const loose = new FacilityNetwork({ cellDegrees: 0.05 });
    tight.addAll(RECORDS);
    loose.addAll(RECORDS);
    expect(loose.stats().cells).toBeLessThan(tight.stats().cells);
  });
});
