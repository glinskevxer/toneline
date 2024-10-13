import { describe, expect, it } from 'vitest';
import {
  CHANGE_KINDS,
  buildChange,
  applyChange,
  ticketsAffected,
  sortChanges,
  describeChange,
} from '../../src/network/changes.js';
import { buildNetwork } from '../../src/network/network.js';
import { FacilityError, buildFacility } from '../../src/network/facility.js';
import { buildTicket } from '../../src/ticket/record.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);

function network() {
  return buildNetwork([
    { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B] },
    {
      id: 'WT-1',
      type: 'water',
      district: 'CENTRAL',
      path: [destination(A, 40, 0), destination(B, 40, 0)],
    },
  ]);
}

function change(overrides = {}) {
  return buildChange({
    kind: 'added',
    facilityId: 'GM-9',
    at: '2024-03-20T09:00',
    by: 'mapping',
    facility: { id: 'GM-9', type: 'gas', path: [destination(A, 10, 0), destination(B, 10, 0)] },
    ...overrides,
  });
}

describe('buildChange', () => {
  it('builds a frozen record', () => {
    const built = change();
    expect(built.kind).toBe('ADDED');
    expect(built.facilityId).toBe('GM-9');
    expect(Object.isFrozen(built)).toBe(true);
  });

  it('lists the kinds it accepts', () => {
    expect(CHANGE_KINDS).toEqual(['ADDED', 'MOVED', 'ABANDONED', 'REMOVED']);
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildChange(null)).toThrow(FacilityError);
  });

  it('rejects a kind it does not know', () => {
    expect(() => change({ kind: 'painted' })).toThrow(/not a change the mapping system sends/);
  });

  it('rejects a bad timestamp or a missing author', () => {
    expect(() => change({ at: '2024-03-20' })).toThrow(/needs a timestamp/);
    expect(() => change({ by: '' })).toThrow(/by is required/);
  });

  it('demands the facility on an add or a move', () => {
    expect(() => change({ facility: null })).toThrow(/as it now stands/);
    expect(() => change({ kind: 'moved', facility: null })).toThrow(/as it now stands/);
  });

  it('does not demand a facility on an abandon or a remove', () => {
    expect(change({ kind: 'abandoned', facilityId: 'GM-1', facility: null }).facility).toBeNull();
  });

  it('refuses a facility naming a different run', () => {
    expect(() => change({ facilityId: 'GM-8' })).toThrow(/name different runs/);
  });
});

describe('applyChange', () => {
  it('adds a new run', () => {
    const held = network();
    const added = applyChange(held, change());
    expect(held.size).toBe(3);
    expect(added.id).toBe('GM-9');
  });

  it('refuses to add a run it already has', () => {
    const held = network();
    const clash = change({
      facilityId: 'GM-1',
      facility: { id: 'GM-1', type: 'gas', path: [A, B] },
    });
    expect(() => applyChange(held, clash)).toThrow(/already carries/);
  });

  it('moves a run and leaves the count alone', () => {
    const held = network();
    const moved = change({
      kind: 'moved',
      facilityId: 'GM-1',
      facility: { id: 'GM-1', type: 'gas', path: [destination(A, 25, 0), destination(B, 25, 0)] },
    });
    applyChange(held, moved);
    expect(held.size).toBe(2);
    expect(held.get('GM-1').path[0].lat).toBeGreaterThan(A.lat);
  });

  it('finds a moved run at its new place and not its old one', () => {
    const held = network();
    applyChange(
      held,
      change({
        kind: 'moved',
        facilityId: 'GM-1',
        facility: {
          id: 'GM-1',
          type: 'gas',
          path: [destination(A, 400, 0), destination(B, 400, 0)],
        },
      })
    );
    expect(held.near(A, 20).map((hit) => hit.facility.id)).toEqual([]);
    expect(held.near(destination(A, 400, 0), 20).map((hit) => hit.facility.id)).toEqual(['GM-1']);
  });

  it('abandons a run in place', () => {
    const held = network();
    const abandoned = applyChange(
      held,
      change({ kind: 'abandoned', facilityId: 'WT-1', facility: null })
    );
    expect(abandoned.abandoned).toBe(true);
    expect(held.size).toBe(2);
    expect(held.get('WT-1').abandoned).toBe(true);
  });

  it('removes a run entirely', () => {
    const held = network();
    expect(
      applyChange(held, change({ kind: 'removed', facilityId: 'WT-1', facility: null }))
    ).toBeNull();
    expect(held.size).toBe(1);
    expect(held.get('WT-1')).toBeNull();
    expect(held.near(destination(A, 40, 0), 10)).toEqual([]);
  });

  it('refuses to touch a run the network does not carry', () => {
    const held = network();
    expect(() =>
      applyChange(held, change({ kind: 'removed', facilityId: 'ZZ-9', facility: null }))
    ).toThrow(/does not carry that facility/);
  });
});

describe('ticketsAffected', () => {
  const near = buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: 'on the main',
    site: { points: [destination(A, 150, 90)] },
    extent: '20 feet',
  });
  const away = buildTicket({
    number: 'B240315000421',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: 'miles off',
    site: { points: [{ lat: 35.6, lon: -97.3 }] },
    extent: '20 feet',
  });

  it('names the tickets the change could touch', () => {
    expect(ticketsAffected(change(), [near, away])).toEqual(['B240315000420']);
  });

  it('names nothing when the change carries no geometry at all', () => {
    const bare = change({ kind: 'removed', facilityId: 'GM-1', facility: null });
    expect(ticketsAffected(bare, [near, away])).toEqual([]);
  });

  it('uses the previous shape when the change carries none', () => {
    const bare = change({ kind: 'removed', facilityId: 'GM-1', facility: null });
    const previous = buildFacility({ id: 'GM-1', type: 'gas', path: [A, B] });
    expect(ticketsAffected(bare, [near, away], { previous })).toEqual(['B240315000420']);
  });

  it('skips a ticket with no geometry', () => {
    const bareTicket = buildTicket({
      number: 'B240315000422',
      type: 'NORMAL',
      takenAt: '2024-03-15T09:00',
      address: 'no grids',
    });
    expect(ticketsAffected(change(), [bareTicket])).toEqual([]);
  });
});

describe('sortChanges and describeChange', () => {
  it('sorts oldest first', () => {
    const later = change({ at: '2024-03-21T09:00' });
    expect(sortChanges([later, change()]).map((entry) => entry.at)).toEqual([
      '2024-03-20T09:00',
      '2024-03-21T09:00',
    ]);
  });

  it('describes a change in one line', () => {
    expect(describeChange(change())).toBe('2024-03-20T09:00 GM-9 added by mapping');
  });
});
