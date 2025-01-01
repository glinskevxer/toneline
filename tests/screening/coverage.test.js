import { describe, expect, it } from 'vitest';
import {
  touchedFacilities,
  untouchedFacilities,
  districtCounts,
  outsideByPlace,
  coverageReport,
  suspectPlaces,
} from '../../src/screening/coverage.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildTicket } from '../../src/ticket/record.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);

const network = buildNetwork([
  { id: 'GM-1', type: 'gas', path: [A, B] },
  { id: 'WT-1', type: 'water', path: [A, B] },
  {
    id: 'CV-9',
    type: 'catv',
    path: [
      { lat: 35.6, lon: -97.3 },
      { lat: 35.61, lon: -97.3 },
    ],
  },
]);

function ticket(number, place = 'Oklahoma City') {
  return buildTicket({
    number,
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: 'somewhere',
    place,
  });
}

function screening(overrides = {}) {
  return { ours: true, districts: ['CENTRAL'], hits: [], ...overrides };
}

describe('touchedFacilities and untouchedFacilities', () => {
  const screenings = [
    screening({ hits: [{ facilityId: 'GM-1' }, { facilityId: 'WT-1' }] }),
    screening({ hits: [{ facilityId: 'GM-1' }] }),
  ];

  it('names each facility once, sorted', () => {
    expect(touchedFacilities(screenings)).toEqual(['GM-1', 'WT-1']);
  });

  it('names the plant nothing ever came near', () => {
    expect(untouchedFacilities(network, screenings)).toEqual(['CV-9']);
  });

  it('names everything when nothing was screened', () => {
    expect(untouchedFacilities(network, [])).toEqual(['CV-9', 'GM-1', 'WT-1']);
    expect(touchedFacilities([])).toEqual([]);
  });
});

describe('districtCounts', () => {
  it('counts how often each district came up', () => {
    expect(districtCounts([screening(), screening({ districts: ['CENTRAL', 'NORTH'] })])).toEqual({
      CENTRAL: 2,
      NORTH: 1,
    });
  });

  it('counts nothing from nothing', () => {
    expect(districtCounts([])).toEqual({});
  });
});

describe('outsideByPlace', () => {
  const entries = [
    { ticket: ticket('B240315000420'), screening: screening() },
    { ticket: ticket('B240315000421', 'Yukon'), screening: screening({ ours: false }) },
    { ticket: ticket('B240315000422', 'yukon'), screening: screening({ ours: false }) },
    { ticket: ticket('B240315000423', 'Edmond'), screening: screening({ ours: false }) },
  ];

  it('groups the tickets that were not ours', () => {
    expect(outsideByPlace(entries)).toEqual([
      { place: 'YUKON', tickets: ['B240315000421', 'B240315000422'] },
      { place: 'EDMOND', tickets: ['B240315000423'] },
    ]);
  });

  it('buckets a ticket with no place', () => {
    const bare = buildTicket({
      number: 'B240315000424',
      type: 'NORMAL',
      takenAt: '2024-03-15T09:00',
      address: 'somewhere',
    });
    const found = outsideByPlace([{ ticket: bare, screening: screening({ ours: false }) }]);
    expect(found[0].place).toBe('unknown');
  });

  it('groups nothing when everything was ours', () => {
    expect(outsideByPlace([entries[0]])).toEqual([]);
  });
});

describe('coverageReport', () => {
  const entries = [
    {
      ticket: ticket('B240315000420'),
      screening: screening({ hits: [{ facilityId: 'GM-1' }] }),
    },
    { ticket: ticket('B240315000421', 'Yukon'), screening: screening({ ours: false }) },
  ];

  it('counts what was ours and what was not', () => {
    const report = coverageReport(network, entries);
    expect(report.tickets).toBe(2);
    expect(report.ours).toBe(1);
    expect(report.outside).toBe(1);
  });

  it('reports the plant nothing touched', () => {
    const report = coverageReport(network, entries);
    expect(report.untouched).toEqual(['CV-9', 'WT-1']);
    expect(report.touched).toBe(1);
    expect(report.touchedShare).toBeCloseTo(1 / 3, 6);
  });

  it('reports an empty network without dividing by zero', () => {
    expect(coverageReport(buildNetwork([]), []).touchedShare).toBe(0);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(coverageReport(network, entries))).toBe(true);
  });
});

describe('suspectPlaces', () => {
  it('flags a place with enough tickets to be worth a call', () => {
    const entries = ['B240315000421', 'B240315000422', 'B240315000423'].map((number) => ({
      ticket: ticket(number, 'Yukon'),
      screening: screening({ ours: false }),
    }));
    const report = coverageReport(network, entries);
    expect(suspectPlaces(report).map((place) => place.place)).toEqual(['YUKON']);
    expect(suspectPlaces(report, 4)).toEqual([]);
  });
});
