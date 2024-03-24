import { describe, expect, it } from 'vitest';
import {
  expandYear,
  parseCentreDate,
  parseCentreTime,
  parseCentreStamp,
  formatCentreDate,
  formatCentreStamp,
} from '../../src/time/formats.js';
import { ScheduleError } from '../../src/core/errors.js';

describe('expandYear', () => {
  it('pivots at seventy', () => {
    expect(expandYear(24)).toBe(2024);
    expect(expandYear(69)).toBe(2069);
    expect(expandYear(70)).toBe(1970);
    expect(expandYear(99)).toBe(1999);
  });

  it('leaves a four digit year alone', () => {
    expect(expandYear(2024)).toBe(2024);
  });

  it('rejects anything that is not a whole year', () => {
    expect(() => expandYear(-1)).toThrow(ScheduleError);
    expect(() => expandYear(2024.5)).toThrow(/whole number/);
  });
});

describe('parseCentreDate', () => {
  it('reads month first with a four digit year', () => {
    expect(parseCentreDate('03/15/2024')).toBe('2024-03-15');
  });

  it('reads single digit parts and a two digit year', () => {
    expect(parseCentreDate('3/5/24')).toBe('2024-03-05');
  });

  it('reads dashes as well as slashes', () => {
    expect(parseCentreDate('03-15-2024')).toBe('2024-03-15');
  });

  it('passes an already civil date through', () => {
    expect(parseCentreDate('2024-03-15')).toBe('2024-03-15');
  });

  it('rejects an impossible date', () => {
    expect(() => parseCentreDate('02/30/2024')).toThrow(/day is outside/);
    expect(() => parseCentreDate('2023-02-29')).toThrow(/day is outside/);
  });

  it('rejects a shape it does not read', () => {
    expect(() => parseCentreDate('15 March 2024')).toThrow(/not in a form/);
    expect(() => parseCentreDate(20240315)).toThrow(/must be a string/);
  });
});

describe('parseCentreTime', () => {
  it('reads a colon time', () => {
    expect(parseCentreTime('07:42')).toBe(462);
    expect(parseCentreTime('7:42')).toBe(462);
  });

  it('reads a packed time', () => {
    expect(parseCentreTime('0742')).toBe(462);
    expect(parseCentreTime('742')).toBe(462);
  });

  it('reads a meridiem', () => {
    expect(parseCentreTime('7:42 AM')).toBe(462);
    expect(parseCentreTime('7:42PM')).toBe(1182);
    expect(parseCentreTime('12:00 AM')).toBe(0);
    expect(parseCentreTime('12:30 pm')).toBe(750);
    expect(parseCentreTime('0742pm')).toBe(1182);
  });

  it('rejects an hour a twelve hour clock cannot carry', () => {
    expect(() => parseCentreTime('13:00 PM')).toThrow(/1 to 12/);
    expect(() => parseCentreTime('00:30 AM')).toThrow(/1 to 12/);
  });

  it('rejects a time outside the day', () => {
    expect(() => parseCentreTime('25:00')).toThrow(/outside the day/);
    expect(() => parseCentreTime('0799')).toThrow(/outside the day/);
  });

  it('rejects a shape it does not read', () => {
    expect(() => parseCentreTime('quarter past')).toThrow(/not in a form/);
    expect(() => parseCentreTime(742)).toThrow(/must be a string/);
  });
});

describe('parseCentreStamp', () => {
  it('reads a date and a time', () => {
    expect(parseCentreStamp('03/15/2024 07:42')).toBe('2024-03-15T07:42');
  });

  it('reads a date and a time with a space before the meridiem', () => {
    expect(parseCentreStamp('03/15/2024 7:42 PM')).toBe('2024-03-15T19:42');
  });

  it('treats a bare date as midnight', () => {
    expect(parseCentreStamp('03/15/2024')).toBe('2024-03-15T00:00');
  });

  it('rejects a non string', () => {
    expect(() => parseCentreStamp(null)).toThrow(/must be a string/);
  });
});

describe('formatting back out', () => {
  it('prints a date the way the centre does', () => {
    expect(formatCentreDate('2024-03-05')).toBe('03/05/2024');
  });

  it('prints a timestamp the way the centre does', () => {
    expect(formatCentreStamp('2024-03-15T07:42')).toBe('03/15/2024 07:42');
  });

  it('round trips', () => {
    expect(parseCentreStamp(formatCentreStamp('2024-03-15T19:05'))).toBe('2024-03-15T19:05');
  });
});
