import { describe, expect, it } from 'vitest';
import { MARKERS, RecordError, asRecord, asRecords, isBuilt } from '../../src/core/records.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildFacility } from '../../src/network/facility.js';

const RAW = {
  number: 'B240315000420',
  type: 'NORMAL',
  takenAt: '2024-03-15T07:42',
  address: '1420 NW 23RD ST',
};

describe('isBuilt', () => {
  it('recognises a record that has been through its builder', () => {
    expect(isBuilt(buildTicket(RAW), MARKERS.ticket)).toBe(true);
  });

  it('does not recognise a loose object', () => {
    expect(isBuilt(RAW, MARKERS.ticket)).toBe(false);
  });

  it('does not recognise a frozen object missing the fields', () => {
    expect(isBuilt(Object.freeze({ number: 'B1' }), MARKERS.ticket)).toBe(false);
  });

  it('does not recognise an unfrozen object carrying the fields', () => {
    const pretender = { ...buildTicket(RAW) };
    expect(isBuilt(pretender, MARKERS.ticket)).toBe(false);
  });

  it('does not recognise anything that is not an object', () => {
    expect(isBuilt(null, MARKERS.ticket)).toBe(false);
    expect(isBuilt('B240315000420', MARKERS.ticket)).toBe(false);
  });

  it('keeps the markers apart', () => {
    expect(isBuilt(buildTicket(RAW), MARKERS.facility)).toBe(false);
  });
});

describe('asRecord', () => {
  it('hands a built record straight back', () => {
    const built = buildTicket(RAW);
    expect(asRecord(built, buildTicket, MARKERS.ticket)).toBe(built);
  });

  it('builds a loose object', () => {
    const built = asRecord(RAW, buildTicket, MARKERS.ticket);
    expect(built.base).toBe('B240315000420');
    expect(Object.isFrozen(built)).toBe(true);
  });

  it('rebuilds a copy of a record rather than trusting it', () => {
    const copy = { ...buildTicket(RAW), status: 'NONSENSE' };
    expect(() => asRecord(copy, buildTicket, MARKERS.ticket)).toThrow();
  });

  it('lets the builder refuse what it should refuse', () => {
    expect(() => asRecord({ ...RAW, type: 'ROUTINE' }, buildTicket, MARKERS.ticket)).toThrow();
  });

  it('rejects a builder that is not a function', () => {
    expect(() => asRecord(RAW, null, MARKERS.ticket)).toThrow(RecordError);
  });
});

describe('asRecords', () => {
  it('takes a list of either', () => {
    const built = buildTicket(RAW);
    const list = asRecords(
      [built, { ...RAW, number: 'B240315000421' }],
      buildTicket,
      MARKERS.ticket
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toBe(built);
    expect(list[1].number).toBe('B240315000421');
  });

  it('takes an empty list', () => {
    expect(asRecords([], buildTicket, MARKERS.ticket)).toEqual([]);
  });

  it('rejects anything that is not a list', () => {
    expect(() => asRecords(RAW, buildTicket, MARKERS.ticket)).toThrow(/must be an array/);
  });
});

describe('the markers themselves', () => {
  it('names every kind of record the stores take', () => {
    expect(Object.keys(MARKERS).sort()).toEqual([
      'assignment',
      'damage',
      'facility',
      'response',
      'ticket',
    ]);
  });

  it('recognises a built facility', () => {
    const facility = buildFacility({
      id: 'GM-1',
      type: 'gas',
      path: [
        { lat: 35.4676, lon: -97.5164 },
        { lat: 35.4676, lon: -97.5144 },
      ],
    });
    expect(isBuilt(facility, MARKERS.facility)).toBe(true);
  });
});
