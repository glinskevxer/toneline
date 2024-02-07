import { describe, expect, it } from 'vitest';
import {
  parseTicketNumber,
  formatTicketNumber,
  baseTicketNumber,
  sameExcavation,
  nextRevision,
} from '../../src/core/ids.js';
import { TicketError } from '../../src/core/errors.js';

describe('parseTicketNumber', () => {
  it('splits a plain ticket number', () => {
    expect(parseTicketNumber('B240315000420')).toEqual({
      centre: 'B',
      taken: '2024-03-15',
      sequence: 420,
      revision: 0,
      base: 'B240315000420',
    });
  });

  it('reads a revision suffix', () => {
    const parts = parseTicketNumber('OKC241201009901-03');
    expect(parts.centre).toBe('OKC');
    expect(parts.revision).toBe(3);
    expect(parts.base).toBe('OKC241201009901');
  });

  it('accepts lower case and surrounding space', () => {
    expect(parseTicketNumber('  b240315000420 ').centre).toBe('B');
  });

  it('rejects a non string', () => {
    expect(() => parseTicketNumber(42)).toThrow(TicketError);
  });

  it('rejects a number that does not match the centre format', () => {
    expect(() => parseTicketNumber('12345')).toThrow(/centre format/);
  });

  it('rejects an impossible take date', () => {
    expect(() => parseTicketNumber('B241315000420')).toThrow(/impossible take date/);
    expect(() => parseTicketNumber('B240015000420')).toThrow(/impossible take date/);
    expect(() => parseTicketNumber('B240300000420')).toThrow(/impossible take date/);
  });
});

describe('formatTicketNumber', () => {
  it('pads the sequence out to six digits', () => {
    expect(formatTicketNumber({ centre: 'B', taken: '2024-03-15', sequence: 420 })).toBe(
      'B240315000420'
    );
  });

  it('adds a revision when one is asked for', () => {
    expect(
      formatTicketNumber({ centre: 'OKC', taken: '2024-12-01', sequence: 9901, revision: 3 })
    ).toBe('OKC241201009901-03');
  });

  it('rejects a bad centre prefix', () => {
    expect(() => formatTicketNumber({ centre: 'bcde', taken: '2024-03-15', sequence: 1 })).toThrow(
      /centre prefix/
    );
  });

  it('rejects a take date that is not a calendar date', () => {
    expect(() => formatTicketNumber({ centre: 'B', taken: '15/03/2024', sequence: 1 })).toThrow(
      /ISO calendar date/
    );
  });

  it('rejects a sequence that will not fit', () => {
    expect(() =>
      formatTicketNumber({ centre: 'B', taken: '2024-03-15', sequence: 1000000 })
    ).toThrow(/six digits/);
  });

  it('rejects a revision that will not fit', () => {
    expect(() =>
      formatTicketNumber({ centre: 'B', taken: '2024-03-15', sequence: 1, revision: 100 })
    ).toThrow(/two digits/);
  });

  it('round trips through parseTicketNumber', () => {
    const original = 'AB250107012345-07';
    expect(formatTicketNumber(parseTicketNumber(original))).toBe(original);
  });
});

describe('ticket identity helpers', () => {
  it('strips the revision from a ticket number', () => {
    expect(baseTicketNumber('B240315000420-11')).toBe('B240315000420');
  });

  it('matches revisions of the same excavation', () => {
    expect(sameExcavation('B240315000420', 'B240315000420-02')).toBe(true);
    expect(sameExcavation('B240315000420', 'B240315000421')).toBe(false);
  });

  it('advances the revision', () => {
    expect(nextRevision('B240315000420')).toBe('B240315000420-01');
    expect(nextRevision('B240315000420-09')).toBe('B240315000420-10');
  });

  it('refuses to advance past the last revision', () => {
    expect(() => nextRevision('B240315000420-99')).toThrow(/exhausted/);
  });
});
