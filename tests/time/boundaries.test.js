import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, eachDate, isLeapYear, weekday } from '../../src/time/date.js';
import { addMinutes, minutesBetween, shiftDays } from '../../src/time/stamp.js';
import { Calendar } from '../../src/time/calendar.js';
import { WorkSchedule } from '../../src/time/workhours.js';
import { holidayList } from '../../src/time/holidays.js';
import { lawfulStartFrom } from '../../src/ticket/lawfulStart.js';
import { parseCentreDate, parseCentreStamp } from '../../src/time/formats.js';

/**
 * Every rule in this library is stated in calendar days, and a test written on
 * one afternoon only ever exercises the boundaries that afternoon happens to
 * sit near. These walk a whole year so a rule that only breaks in February or
 * on a year end has somewhere to show itself.
 */

const calendar = new Calendar({ holidays: holidayList({ preset: 'FEDERAL' }) });
const schedule = new WorkSchedule({ calendar });

function everyDayOf(year) {
  return eachDate(`${year}-01-01`, `${year}-12-31`);
}

describe('a whole year of dates', () => {
  for (const year of [2023, 2024, 2100]) {
    it(`walks ${year} without losing a day`, () => {
      const days = everyDayOf(year);
      expect(days).toHaveLength(isLeapYear(year) ? 366 : 365);
      expect(days[0]).toBe(`${year}-01-01`);
      expect(days[days.length - 1]).toBe(`${year}-12-31`);
    });
  }

  it('steps one day at a time all the way through a leap year', () => {
    let cursor = '2024-01-01';
    for (let i = 0; i < 366; i += 1) cursor = addDays(cursor, 1);
    expect(cursor).toBe('2025-01-01');
  });

  it('counts the days between every month end and the next', () => {
    const lengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lengths.forEach((length, index) => {
      const month = String(index + 1).padStart(2, '0');
      const first = `2024-${month}-01`;
      expect(daysBetween(first, addDays(first, length))).toBe(length);
    });
  });

  it('keeps the weekday cycle unbroken across a year', () => {
    let previous = weekday('2024-01-01');
    for (const day of everyDayOf(2024).slice(1)) {
      expect(weekday(day)).toBe((previous + 1) % 7);
      previous = weekday(day);
    }
  });
});

describe('a whole year of lawful starts', () => {
  it('never lands before the day the call was taken', () => {
    for (const day of everyDayOf(2024)) {
      const start = lawfulStartFrom({ takenAt: `${day}T09:00`, type: 'NORMAL', calendar });
      expect(daysBetween(day, start.slice(0, 10))).toBeGreaterThanOrEqual(2);
    }
  });

  it('always lands on a business day', () => {
    for (const day of everyDayOf(2024)) {
      const start = lawfulStartFrom({ takenAt: `${day}T09:00`, type: 'NORMAL', calendar });
      expect(calendar.isBusinessDay(start.slice(0, 10))).toBe(true);
    }
  });

  it('keeps the clock time it was given', () => {
    for (const day of everyDayOf(2024)) {
      expect(lawfulStartFrom({ takenAt: `${day}T14:37`, type: 'NORMAL', calendar })).toMatch(
        /T14:37$/
      );
    }
  });

  it('never takes longer than a fortnight, even over the holidays', () => {
    for (const day of everyDayOf(2024)) {
      const start = lawfulStartFrom({ takenAt: `${day}T09:00`, type: 'NORMAL', calendar });
      expect(daysBetween(day, start.slice(0, 10))).toBeLessThanOrEqual(14);
    }
  });
});

describe('a whole year of business day arithmetic', () => {
  it('always lands on a business day when adding one', () => {
    for (const day of everyDayOf(2024)) {
      expect(calendar.isBusinessDay(calendar.addBusinessDays(day, 1))).toBe(true);
    }
  });

  it('agrees with itself walking forwards and back', () => {
    for (const day of everyDayOf(2024)) {
      if (!calendar.isBusinessDay(day)) continue;
      expect(calendar.addBusinessDays(calendar.addBusinessDays(day, 3), -3)).toBe(day);
    }
  });

  it('never counts a weekend or a holiday as a business day', () => {
    for (const day of everyDayOf(2024)) {
      const dow = weekday(day);
      if (dow === 0 || dow === 6) expect(calendar.isBusinessDay(day)).toBe(false);
      if (calendar.holidayName(day) !== null) expect(calendar.isBusinessDay(day)).toBe(false);
    }
  });
});

describe('a whole year of working hours', () => {
  it('always opens on a business day', () => {
    for (const day of everyDayOf(2024)) {
      const open = schedule.nextOpen(`${day}T00:00`);
      expect(calendar.isBusinessDay(open.slice(0, 10))).toBe(true);
    }
  });

  it('never runs a working span backwards', () => {
    for (const day of everyDayOf(2024)) {
      const from = `${day}T09:00`;
      expect(minutesBetween(from, schedule.addWorkingHours(from, 4))).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('timestamps across the boundaries', () => {
  it('crosses every month end by the minute', () => {
    for (const month of Array.from({ length: 12 }, (unused, index) => index + 1)) {
      const label = String(month).padStart(2, '0');
      const lastDay = addDays(`2024-${label}-01`, -1 + daysInMonthOf(2024, month));
      expect(addMinutes(`${lastDay}T23:59`, 1)).toBe(`${addDays(lastDay, 1)}T00:00`);
    }
  });

  it('crosses the year end', () => {
    expect(addMinutes('2024-12-31T23:59', 1)).toBe('2025-01-01T00:00');
    expect(shiftDays('2024-12-31T09:00', 1)).toBe('2025-01-01T09:00');
  });

  it('reads the centre format on every day of a leap year', () => {
    for (const day of everyDayOf(2024)) {
      const [year, month, dayOfMonth] = day.split('-');
      expect(parseCentreDate(`${month}/${dayOfMonth}/${year}`)).toBe(day);
      expect(parseCentreStamp(`${month}/${dayOfMonth}/${year} 07:42`)).toBe(`${day}T07:42`);
    }
  });
});

function daysInMonthOf(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
