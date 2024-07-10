import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUPLICATE_POLICY,
  duplicatePolicy,
  withinWindow,
  areasOverlap,
  duplicateScore,
  findDuplicates,
  groupDuplicates,
} from '../../src/ticket/duplicate.js';
import { buildTicket } from '../../src/ticket/record.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
    place: 'Oklahoma City',
    workType: 'sewer lateral repair',
    excavator: { company: 'Digwell Excavating Inc' },
    site: { points: [A] },
    extent: '50 feet',
    ...overrides,
  });
}

describe('duplicatePolicy', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_DUPLICATE_POLICY.threshold).toBe(0.6);
    expect(duplicatePolicy({ threshold: 0.9 }).withinDays).toBe(14);
  });
});

describe('withinWindow', () => {
  it('accepts a pair close in time', () => {
    expect(
      withinWindow(ticket(), ticket({ number: 'B240320000421', takenAt: '2024-03-20T09:00' }))
    ).toBe(true);
  });

  it('rejects a pair far apart', () => {
    expect(
      withinWindow(ticket(), ticket({ number: 'B240420000421', takenAt: '2024-04-20T09:00' }))
    ).toBe(false);
  });

  it('honours a narrower window', () => {
    const other = ticket({ number: 'B240320000421', takenAt: '2024-03-20T09:00' });
    expect(withinWindow(ticket(), other, duplicatePolicy({ withinDays: 2 }))).toBe(false);
  });
});

describe('areasOverlap', () => {
  it('finds two discs on top of each other', () => {
    expect(areasOverlap(ticket(), ticket({ number: 'B240315000421' }))).toBe(true);
  });

  it('separates two discs a long way apart', () => {
    const far = ticket({ number: 'B240315000421', site: { points: [{ lat: 35.6, lon: -97.3 }] } });
    expect(areasOverlap(ticket(), far)).toBe(false);
  });

  it('reads the site policy from its own key', () => {
    const wide = ticket({
      number: 'B240315000421',
      site: { points: [destination(A, 20, 90)] },
      extent: null,
    });
    expect(areasOverlap(ticket({ extent: null }), wide)).toBe(true);
    expect(
      areasOverlap(ticket({ extent: null }), wide, {
        site: { pointRadiusFeet: 5, corridorHalfWidthFeet: 5, maxRadiusFeet: 100 },
      })
    ).toBe(false);
  });

  it('is false when either ticket has no geometry', () => {
    expect(areasOverlap(ticket(), ticket({ number: 'B240315000421', site: null }))).toBe(false);
  });
});

describe('duplicateScore', () => {
  it('scores a full match highly', () => {
    const other = ticket({ number: 'B240316000421', takenAt: '2024-03-16T08:00' });
    const { score, signals } = duplicateScore(ticket(), other);
    expect(score).toBe(1);
    expect(signals).toContain('same site');
    expect(signals).toContain('same excavator');
    expect(signals).toContain('work areas overlap');
  });

  it('scores nothing for two revisions of the same excavation', () => {
    const revision = ticket({ number: 'B240315000420-01', type: 'UPDATE' });
    expect(duplicateScore(ticket(), revision)).toEqual({ score: 0, signals: ['same excavation'] });
  });

  it('scores nothing when the pair is far apart in time', () => {
    const later = ticket({ number: 'B240420000421', takenAt: '2024-04-20T09:00' });
    expect(duplicateScore(ticket(), later).signals).toEqual(['too far apart in time']);
  });

  it('sees through a company suffix', () => {
    const other = ticket({
      number: 'B240316000421',
      excavator: { company: 'Digwell Excavating LLC' },
    });
    expect(duplicateScore(ticket(), other).signals).toContain('same excavator');
  });

  it('gives half weight to the same address in a different town', () => {
    const other = ticket({ number: 'B240316000421', place: 'Edmond', workType: 'water tap' });
    const { score, signals } = duplicateScore(ticket(), other);
    expect(signals).toContain('same address');
    expect(signals).not.toContain('same site');
    expect(score).toBeLessThan(0.7);
  });

  it('scores a different dig low', () => {
    const other = ticket({
      number: 'B240316000421',
      address: '99 Robinson Ave',
      place: 'Oklahoma City',
      workType: 'pole replacement',
      excavator: { company: 'Sooner Line Construction' },
      site: { points: [destination(A, 4000, 90)] },
    });
    expect(duplicateScore(ticket(), other).score).toBe(0);
  });

  it('copes with a ticket carrying no excavator or work type', () => {
    const bare = ticket({ number: 'B240316000421', excavator: null, workType: null });
    expect(duplicateScore(ticket(), bare).signals).not.toContain('same excavator');
  });
});

describe('findDuplicates', () => {
  const original = ticket();
  const twin = ticket({ number: 'B240316000421', takenAt: '2024-03-16T08:00' });
  const stranger = ticket({
    number: 'B240316000422',
    address: '99 Robinson Ave',
    workType: 'pole replacement',
    excavator: { company: 'Sooner Line Construction' },
    site: { points: [destination(A, 4000, 90)] },
  });

  it('finds the twin and leaves the stranger', () => {
    const found = findDuplicates(original, [twin, stranger]);
    expect(found.map((entry) => entry.number)).toEqual(['B240316000421']);
    expect(found[0].score).toBe(1);
  });

  it('honours a raised threshold', () => {
    const half = ticket({
      number: 'B240316000423',
      place: 'Edmond',
      workType: 'water tap',
      site: { points: [destination(A, 4000, 90)] },
    });
    expect(
      findDuplicates(original, [half], { policy: duplicatePolicy({ threshold: 0.3 }) })
    ).toHaveLength(1);
    expect(findDuplicates(original, [half])).toEqual([]);
  });

  it('finds nothing among nothing', () => {
    expect(findDuplicates(original, [])).toEqual([]);
  });
});

describe('groupDuplicates', () => {
  it('clusters the twins and leaves the rest alone', () => {
    const original = ticket();
    const twin = ticket({ number: 'B240316000421', takenAt: '2024-03-16T08:00' });
    const stranger = ticket({
      number: 'B240316000422',
      address: '99 Robinson Ave',
      workType: 'pole replacement',
      excavator: { company: 'Sooner Line Construction' },
      site: { points: [destination(A, 4000, 90)] },
    });
    const groups = groupDuplicates([original, twin, stranger]);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((t) => t.number)).toEqual(['B240315000420', 'B240316000421']);
    expect(groups[1]).toHaveLength(1);
  });

  it('groups nothing from nothing', () => {
    expect(groupDuplicates([])).toEqual([]);
  });
});
