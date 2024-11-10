import { describe, expect, it } from 'vitest';
import {
  conflictingIds,
  compareScreenings,
  rescreenTicket,
  rescreenBatch,
  describeDifference,
} from '../../src/screening/rescreen.js';
import { screenTicket } from '../../src/screening/screen.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildDistricts } from '../../src/network/district.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildChange, applyChange } from '../../src/network/changes.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);

const districts = buildDistricts([
  {
    code: 'CENTRAL',
    members: ['CTG01'],
    boundary: [
      { lat: 35.44, lon: -97.56 },
      { lat: 35.48, lon: -97.56 },
      { lat: 35.48, lon: -97.5 },
      { lat: 35.44, lon: -97.5 },
    ],
  },
]);

function ticket() {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
    members: ['CTG01'],
    site: { points: [destination(A, 150, 90)] },
    extent: '10 feet',
  });
}

function screening(network) {
  return screenTicket(ticket(), { network, districts });
}

describe('conflictingIds', () => {
  it('names the live runs inside their zone, sorted', () => {
    const network = buildNetwork([
      { id: 'WT-1', type: 'water', path: [A, B] },
      { id: 'GM-1', type: 'gas', path: [A, B] },
    ]);
    expect(conflictingIds(screening(network))).toEqual(['GM-1', 'WT-1']);
  });

  it('leaves abandoned runs out', () => {
    const network = buildNetwork([{ id: 'WT-9', type: 'water', abandoned: true, path: [A, B] }]);
    expect(conflictingIds(screening(network))).toEqual([]);
  });
});

describe('compareScreenings', () => {
  const empty = buildNetwork([]);
  const withGas = buildNetwork([{ id: 'GM-1', type: 'gas', path: [A, B] }]);

  it('finds a run that appeared', () => {
    const difference = compareScreenings(screening(empty), screening(withGas));
    expect(difference.appeared).toEqual(['GM-1']);
    expect(difference.gone).toEqual([]);
    expect(difference.changed).toBe(true);
    expect(difference.conflictChanged).toBe(true);
  });

  it('finds a run that went away', () => {
    const difference = compareScreenings(screening(withGas), screening(empty));
    expect(difference.gone).toEqual(['GM-1']);
    expect(difference.appeared).toEqual([]);
  });

  it('reports nothing when the picture is the same', () => {
    const difference = compareScreenings(screening(withGas), screening(withGas));
    expect(difference.changed).toBe(false);
    expect(difference.conflictChanged).toBe(false);
  });

  it('ignores a run that appeared well outside the zone', () => {
    const far = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [A, B] },
      { id: 'EL-9', type: 'electric', path: [destination(A, 22, 0), destination(B, 22, 0)] },
    ]);
    const difference = compareScreenings(screening(withGas), screening(far));
    expect(difference.appeared).toEqual([]);
    expect(difference.changed).toBe(false);
  });

  it('notices criticality changing', () => {
    const water = buildNetwork([{ id: 'WT-1', type: 'water', path: [A, B] }]);
    const difference = compareScreenings(screening(water), screening(withGas));
    expect(difference.criticalChanged).toBe(true);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(compareScreenings(screening(empty), screening(withGas)))).toBe(true);
  });
});

describe('rescreenTicket', () => {
  it('says the answer has to change when plant appears', () => {
    const before = screening(buildNetwork([]));
    const network = buildNetwork([{ id: 'GM-1', type: 'gas', path: [A, B] }]);
    const result = rescreenTicket(ticket(), { before, context: { network, districts } });
    expect(result.needsNewPosting).toBe(true);
    expect(result.advice.code).toBe('7');
    expect(result.difference.appeared).toEqual(['GM-1']);
  });

  it('says nothing has to change when the picture holds', () => {
    const network = buildNetwork([{ id: 'GM-1', type: 'gas', path: [A, B] }]);
    const before = screening(network);
    const result = rescreenTicket(ticket(), { before, context: { network, districts } });
    expect(result.needsNewPosting).toBe(false);
  });

  it('picks up a run moved in by the mapping system', () => {
    const network = buildNetwork([
      { id: 'GM-1', type: 'gas', path: [destination(A, 400, 0), destination(B, 400, 0)] },
    ]);
    const before = screening(network);
    applyChange(
      network,
      buildChange({
        kind: 'moved',
        facilityId: 'GM-1',
        at: '2024-03-16T09:00',
        by: 'mapping',
        facility: { id: 'GM-1', type: 'gas', path: [A, B] },
      })
    );
    const result = rescreenTicket(ticket(), { before, context: { network, districts } });
    expect(result.needsNewPosting).toBe(true);
    expect(result.difference.appeared).toEqual(['GM-1']);
  });
});

describe('rescreenBatch and describeDifference', () => {
  it('keeps only the tickets whose answer moved', () => {
    const network = buildNetwork([{ id: 'GM-1', type: 'gas', path: [A, B] }]);
    const moved = rescreenBatch(
      [
        { ticket: ticket(), before: screening(buildNetwork([])) },
        { ticket: ticket(), before: screening(network) },
      ],
      { network, districts }
    );
    expect(moved).toHaveLength(1);
    expect(moved[0].number).toBe('B240315000420');
  });

  it('describes what moved', () => {
    const network = buildNetwork([{ id: 'GM-1', type: 'gas', path: [A, B] }]);
    const appeared = compareScreenings(screening(buildNetwork([])), screening(network));
    expect(describeDifference(appeared)).toBe('GM-1 now in the zone');
    const gone = compareScreenings(screening(network), screening(buildNetwork([])));
    expect(describeDifference(gone)).toBe('GM-1 no longer in the zone');
    expect(describeDifference(compareScreenings(screening(network), screening(network)))).toBe(
      'nothing changed'
    );
  });
});
