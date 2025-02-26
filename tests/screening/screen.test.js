import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCREEN_POLICY,
  screenPolicy,
  screenTicket,
  screenBatch,
  conflictingTypes,
  closestHit,
} from '../../src/screening/screen.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildDistricts } from '../../src/network/district.js';
import { buildTicket } from '../../src/ticket/record.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);

const network = buildNetwork([
  { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B] },
  {
    id: 'EL-1',
    type: 'electric',
    district: 'CENTRAL',
    path: [destination(A, 40, 0), destination(B, 40, 0)],
  },
  {
    id: 'WT-9',
    type: 'water',
    district: 'CENTRAL',
    abandoned: true,
    path: [destination(A, 3, 0), destination(B, 3, 0)],
  },
  {
    id: 'CV-1',
    type: 'catv',
    district: 'CENTRAL',
    path: [destination(A, 400, 0), destination(B, 400, 0)],
  },
]);

const districts = buildDistricts([
  {
    code: 'CENTRAL',
    members: ['OKGAS01'],
    boundary: [
      { lat: 35.44, lon: -97.56 },
      { lat: 35.48, lon: -97.56 },
      { lat: 35.48, lon: -97.5 },
      { lat: 35.44, lon: -97.5 },
    ],
  },
]);

function ticket(site, overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
    members: ['OKGAS01'],
    site,
    ...overrides,
  });
}

describe('screenPolicy', () => {
  it('ships defaults and merges an override', () => {
    expect(DEFAULT_SCREEN_POLICY.noticeMarginFeet).toBe(25);
    expect(screenPolicy({ noticeMarginFeet: 0 }).reportAbandoned).toBe(true);
  });
});

describe('screenTicket', () => {
  const onTheMain = ticket({ points: [destination(A, 150, 90)] }, { extent: '10 feet' });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(screenTicket(onTheMain, { network, districts }))).toBe(true);
  });

  it('finds the run the dig sits on', () => {
    const result = screenTicket(onTheMain, { network, districts });
    expect(result.hits.map((hit) => hit.facilityId)).toContain('GM-1');
    expect(result.conflict).toBe(true);
    expect(result.critical).toBe(true);
    expect(result.clearReason).toBeNull();
  });

  it('names the districts the site falls in', () => {
    expect(screenTicket(onTheMain, { network, districts }).districts).toEqual(['CENTRAL']);
  });

  it('reports the tolerance zone and the offset in feet', () => {
    const hit = screenTicket(onTheMain, { network, districts }).hits[0];
    expect(hit.toleranceFeet).toBe(18);
    expect(hit.feet).toBeCloseTo(hit.metres * 3.2808, 2);
    expect(hit.insideTolerance).toBe(true);
  });

  it('reports an abandoned run but does not call it a conflict', () => {
    const result = screenTicket(onTheMain, { network, districts });
    const abandoned = result.hits.find((hit) => hit.facilityId === 'WT-9');
    expect(abandoned.abandoned).toBe(true);
    expect(conflictingTypes(result)).not.toContain('WATER');
  });

  it('leaves an abandoned run out when the policy says so', () => {
    const result = screenTicket(onTheMain, {
      network,
      districts,
      policy: screenPolicy({ reportAbandoned: false }),
    });
    expect(result.hits.map((hit) => hit.facilityId)).not.toContain('WT-9');
  });

  it('clears a dig with nothing near it', () => {
    const far = ticket({ points: [{ lat: 35.45, lon: -97.55 }] }, { extent: '10 feet' });
    const result = screenTicket(far, { network, districts });
    expect(result.hits).toEqual([]);
    expect(result.conflict).toBe(false);
    expect(result.clearReason).toBe('no facilities');
  });

  it('clears a dig that is close but outside every tolerance zone', () => {
    const beside = ticket(
      { points: [destination(destination(A, 150, 90), 8, 0)] },
      { extent: '5 feet' }
    );
    const result = screenTicket(beside, { network, districts });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.conflict).toBe(false);
    expect(result.clearReason).toBe('outside tolerance');
  });

  it('says a site outside every district is not ours', () => {
    const away = buildTicket({
      number: 'B240315000999',
      type: 'NORMAL',
      takenAt: '2024-03-15T07:42',
      address: 'somewhere else',
      members: ['CITYWTR'],
      site: { points: [{ lat: 34.0, lon: -99.0 }] },
      extent: '10 feet',
    });
    const result = screenTicket(away, { network, districts });
    expect(result.ours).toBe(false);
    expect(result.clearReason).toBe('outside district');
  });

  it('treats a member code as claiming the ticket even without geometry', () => {
    const noGrids = ticket(null);
    const result = screenTicket(noGrids, { network, districts });
    expect(result.workArea.source).toBe('none');
    expect(result.memberClaimed).toBe(true);
    expect(result.ours).toBe(true);
    expect(result.clearReason).toBeNull();
  });

  it('flags a bare ticket that is not ours either', () => {
    const noGrids = ticket(null, { members: ['CITYWTR'] });
    expect(screenTicket(noGrids, { network, districts }).clearReason).toBe('no geometry');
  });

  it('treats every ticket as ours when no districts were loaded', () => {
    expect(screenTicket(onTheMain, { network }).ours).toBe(true);
  });
});

describe('screenBatch and helpers', () => {
  const onTheMain = ticket({ points: [destination(A, 150, 90)] }, { extent: '10 feet' });

  it('keeps the order it was given', () => {
    const results = screenBatch([onTheMain, onTheMain], { network, districts });
    expect(results).toHaveLength(2);
    expect(results[0].number).toBe('B240315000420');
  });

  it('lists the conflicting types once and sorted', () => {
    expect(conflictingTypes(screenTicket(onTheMain, { network, districts }))).toEqual(['GAS']);
  });

  it('names the closest live facility', () => {
    expect(closestHit(screenTicket(onTheMain, { network, districts })).facilityId).toBe('GM-1');
  });

  it('has no closest facility on a clear ticket', () => {
    const far = ticket({ points: [{ lat: 35.45, lon: -97.55 }] }, { extent: '10 feet' });
    expect(closestHit(screenTicket(far, { network, districts }))).toBeNull();
  });
});

describe('depth on a screening', () => {
  it('judges each hit on depth as well as distance', () => {
    const shallow = ticket(
      { points: [destination(A, 150, 90)] },
      { extent: '10 feet', depthFeet: 1 }
    );
    const result = screenTicket(shallow, { network, districts });
    const gas = result.hits.find((hit) => hit.facilityId === 'GM-1');
    expect(gas.depthVerdict).toBeDefined();
  });

  it('says the dig clears on depth when it passes under everything', () => {
    const deep = buildNetwork([
      { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B], depthFeet: 3 },
    ]);
    const bore = ticket(
      { points: [destination(A, 150, 90)] },
      { extent: '10 feet', boring: true, depthFeet: 14 }
    );
    const result = screenTicket(bore, { network: deep, districts });
    expect(result.conflict).toBe(true);
    expect(result.depthCleared).toBe(true);
  });

  it('does not clear on depth when the cut reaches the main', () => {
    const deep = buildNetwork([
      { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B], depthFeet: 3 },
    ]);
    const cut = ticket({ points: [destination(A, 150, 90)] }, { extent: '10 feet', depthFeet: 6 });
    expect(screenTicket(cut, { network: deep, districts }).depthCleared).toBe(false);
  });

  it('cannot clear on depth when the plant has no recorded depth', () => {
    const bore = ticket(
      { points: [destination(A, 150, 90)] },
      { extent: '10 feet', boring: true, depthFeet: 14 }
    );
    expect(screenTicket(bore, { network, districts }).depthCleared).toBe(false);
  });

  it('can be told not to check depth at all', () => {
    const bore = ticket(
      { points: [destination(A, 150, 90)] },
      { extent: '10 feet', boring: true, depthFeet: 14 }
    );
    const result = screenTicket(bore, {
      network,
      districts,
      policy: screenPolicy({ checkDepth: false }),
    });
    expect(result.hits[0].depthReason).toBe('depth was not checked');
    expect(result.depthCleared).toBe(false);
  });

  it('never clears on depth when nothing is in the zone', () => {
    const far = ticket({ points: [{ lat: 35.45, lon: -97.55 }] }, { extent: '10 feet' });
    expect(screenTicket(far, { network, districts }).depthCleared).toBe(false);
  });
});
