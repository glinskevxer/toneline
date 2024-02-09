import { describe, expect, it } from 'vitest';
import {
  parseDate,
  isDate,
  daysInMonth,
  isLeapYear,
  formatDate,
  toDayNumber,
  fromDayNumber,
  addDays,
  daysBetween,
  weekday,
  compareDates,
  minDate,
  maxDate,
  eachDate,
} from '../../src/time/date.js';
import { ScheduleError } from '../../src/core/errors.js';

describe('parseDate', () => {
  it('splits a well formed date', () => {
    expect(parseDate('2024-03-15')).toEqual({ year: 2024, month: 3, day: 15 });
  });

  it('rejects a non string', () => {
    expect(() => parseDate(20240315)).toThrow(ScheduleError);
  });

  it('rejects a mis-shaped string', () => {
    expect(() => parseDate('15/03/2024')).toThrow(/YYYY-MM-DD/);
  });

  it('rejects a month outside the calendar', () => {
    expect(() => parseDate('2024-13-01')).toThrow(/month is outside/);
  });

  it('rejects a day outside the month', () => {
    expect(() => parseDate('2023-02-29')).toThrow(/day is outside/);
    expect(() => parseDate('2024-04-31')).toThrow(/day is outside/);
  });

  it('accepts the leap day in a leap year', () => {
    expect(parseDate('2024-02-29').day).toBe(29);
  });
});

describe('isDate', () => {
  it('answers without throwing', () => {
    expect(isDate('2024-02-29')).toBe(true);
    expect(isDate('2023-02-29')).toBe(false);
    expect(isDate(null)).toBe(false);
  });
});

describe('daysInMonth and isLeapYear', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 6)).toBe(30);
    expect(daysInMonth(2024, 9)).toBe(30);
    expect(daysInMonth(2024, 11)).toBe(30);
    expect(daysInMonth(2024, 1)).toBe(31);
  });

  it('applies the century rule', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(daysInMonth(1900, 2)).toBe(28);
  });
});

describe('day numbers', () => {
  it('pads a formatted date', () => {
    expect(formatDate(2024, 3, 5)).toBe('2024-03-05');
  });

  it('round trips through a day number', () => {
    for (const date of ['1999-12-31', '2000-01-01', '2024-02-29', '2025-08-10']) {
      expect(fromDayNumber(toDayNumber(date))).toBe(date);
    }
  });

  it('rejects a fractional day number', () => {
    expect(() => fromDayNumber(1.5)).toThrow(/integer/);
  });
});

describe('addDays and daysBetween', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
  });

  it('crosses a year boundary backwards', () => {
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('rejects a fractional offset', () => {
    expect(() => addDays('2024-01-01', 0.5)).toThrow(/integer/);
  });

  it('counts signed days between two dates', () => {
    expect(daysBetween('2024-03-01', '2024-03-15')).toBe(14);
    expect(daysBetween('2024-03-15', '2024-03-01')).toBe(-14);
    expect(daysBetween('2024-03-15', '2024-03-15')).toBe(0);
  });
});

describe('weekday', () => {
  it('reads Sunday as zero', () => {
    expect(weekday('2024-03-17')).toBe(0);
    expect(weekday('2024-03-18')).toBe(1);
    expect(weekday('2024-03-23')).toBe(6);
  });
});

describe('comparison helpers', () => {
  it('orders dates', () => {
    expect(compareDates('2024-01-01', '2024-01-02')).toBeLessThan(0);
    expect(compareDates('2024-01-02', '2024-01-01')).toBeGreaterThan(0);
    expect(compareDates('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('picks the earlier and the later', () => {
    expect(minDate('2024-05-01', '2024-04-01')).toBe('2024-04-01');
    expect(maxDate('2024-05-01', '2024-04-01')).toBe('2024-05-01');
    expect(minDate('2024-05-01', '2024-05-01')).toBe('2024-05-01');
  });
});

describe('eachDate', () => {
  it('walks an inclusive range', () => {
    expect(eachDate('2024-02-27', '2024-03-01')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  it('returns a single day for a degenerate range', () => {
    expect(eachDate('2024-02-27', '2024-02-27')).toEqual(['2024-02-27']);
  });

  it('refuses a backwards range', () => {
    expect(() => eachDate('2024-03-01', '2024-02-27')).toThrow(/backwards/);
  });
});
