import { describe, expect, it } from 'vitest';
import { Calendar, resolveHoliday, weekdayIndex } from '../../src/time/calendar.js';
import { ScheduleError } from '../../src/core/errors.js';

const RULES = [
  { kind: 'fixed', month: 1, day: 1, name: 'new year', observed: 'nearest-weekday' },
  { kind: 'nth-weekday', month: 5, weekday: 'monday', nth: -1, name: 'memorial day' },
  { kind: 'fixed', month: 7, day: 4, name: 'independence day', observed: 'nearest-weekday' },
  { kind: 'nth-weekday', month: 9, weekday: 'monday', nth: 1, name: 'labour day' },
  { kind: 'nth-weekday', month: 11, weekday: 'thursday', nth: 4, name: 'thanksgiving' },
  { kind: 'fixed', month: 12, day: 25, name: 'christmas', observed: 'nearest-weekday' },
];

describe('weekdayIndex', () => {
  it('accepts names in any case and with space', () => {
    expect(weekdayIndex(' Monday ')).toBe(1);
    expect(weekdayIndex('SATURDAY')).toBe(6);
  });

  it('accepts an index already in range', () => {
    expect(weekdayIndex(0)).toBe(0);
    expect(weekdayIndex(6)).toBe(6);
  });

  it('rejects anything else', () => {
    expect(() => weekdayIndex(7)).toThrow(ScheduleError);
    expect(() => weekdayIndex('funday')).toThrow(/name or an index/);
  });
});

describe('resolveHoliday', () => {
  it('resolves a fixed date', () => {
    expect(resolveHoliday({ kind: 'fixed', month: 7, day: 4 }, 2024)).toBe('2024-07-04');
  });

  it('shifts a saturday holiday back to the friday', () => {
    const rule = { kind: 'fixed', month: 7, day: 4, observed: 'nearest-weekday' };
    expect(resolveHoliday(rule, 2026)).toBe('2026-07-03');
  });

  it('shifts a sunday holiday forward to the monday', () => {
    const rule = { kind: 'fixed', month: 12, day: 25, observed: 'nearest-weekday' };
    expect(resolveHoliday(rule, 2022)).toBe('2022-12-26');
  });

  it('leaves a weekday holiday alone', () => {
    const rule = { kind: 'fixed', month: 7, day: 4, observed: 'nearest-weekday' };
    expect(resolveHoliday(rule, 2024)).toBe('2024-07-04');
  });

  it('resolves the nth weekday of a month', () => {
    expect(
      resolveHoliday({ kind: 'nth-weekday', month: 11, weekday: 'thursday', nth: 4 }, 2024)
    ).toBe('2024-11-28');
  });

  it('resolves the last weekday of a month', () => {
    expect(
      resolveHoliday({ kind: 'nth-weekday', month: 5, weekday: 'monday', nth: -1 }, 2024)
    ).toBe('2024-05-27');
  });

  it('rejects a rule that is not an object', () => {
    expect(() => resolveHoliday(null, 2024)).toThrow(/must be an object/);
  });

  it('rejects a non integer year', () => {
    expect(() => resolveHoliday({ kind: 'fixed', month: 1, day: 1 }, 2024.5)).toThrow(/integer/);
  });

  it('rejects an unknown rule kind', () => {
    expect(() => resolveHoliday({ kind: 'easter' }, 2024)).toThrow(/not recognised/);
  });

  it('rejects a fixed rule with a bad month or day', () => {
    expect(() => resolveHoliday({ kind: 'fixed', month: 13, day: 1 }, 2024)).toThrow(/month/);
    expect(() => resolveHoliday({ kind: 'fixed', month: 2, day: 30 }, 2024)).toThrow(/inside the/);
  });

  it('rejects an unknown observed rule', () => {
    expect(() =>
      resolveHoliday({ kind: 'fixed', month: 1, day: 1, observed: 'monday-after' }, 2024)
    ).toThrow(/observed rule/);
  });

  it('rejects an nth weekday rule with a bad ordinal or month', () => {
    expect(() =>
      resolveHoliday({ kind: 'nth-weekday', month: 1, weekday: 'monday', nth: 0 }, 2024)
    ).toThrow(/nth must be/);
    expect(() =>
      resolveHoliday({ kind: 'nth-weekday', month: 0, weekday: 'monday', nth: 1 }, 2024)
    ).toThrow(/month/);
  });

  it('rejects an ordinal the month cannot supply', () => {
    expect(() =>
      resolveHoliday({ kind: 'nth-weekday', month: 2, weekday: 'monday', nth: 5 }, 2027)
    ).toThrow(/does not contain/);
  });
});

describe('Calendar', () => {
  const calendar = new Calendar({ holidays: RULES, name: 'state' });

  it('defaults to a saturday and sunday weekend', () => {
    const plain = new Calendar();
    expect(plain.isBusinessDay('2024-03-16')).toBe(false);
    expect(plain.isBusinessDay('2024-03-17')).toBe(false);
    expect(plain.isBusinessDay('2024-03-18')).toBe(true);
  });

  it('rejects a weekend or holiday list that is not an array', () => {
    expect(() => new Calendar({ weekend: 'saturday' })).toThrow(/must be an array/);
    expect(() => new Calendar({ holidays: {} })).toThrow(/must be an array/);
  });

  it('names the holiday on a date', () => {
    expect(calendar.holidayName('2024-11-28')).toBe('thanksgiving');
    expect(calendar.holidayName('2024-11-27')).toBeNull();
  });

  it('treats an observed holiday as a non business day', () => {
    expect(calendar.isBusinessDay('2024-07-04')).toBe(false);
    expect(calendar.isBusinessDay('2024-07-05')).toBe(true);
  });

  it('caches the resolved year', () => {
    const first = calendar.holidaysIn(2025);
    expect(calendar.holidaysIn(2025)).toBe(first);
  });

  it('finds the next business day across a holiday weekend', () => {
    expect(calendar.nextBusinessDay('2024-08-30')).toBe('2024-09-03');
  });

  it('can include the given day when it is already a business day', () => {
    expect(calendar.nextBusinessDay('2024-08-30', { inclusive: true })).toBe('2024-08-30');
    expect(calendar.nextBusinessDay('2024-09-01', { inclusive: true })).toBe('2024-09-03');
  });

  it('finds the previous business day', () => {
    expect(calendar.previousBusinessDay('2024-09-03')).toBe('2024-08-30');
    expect(calendar.previousBusinessDay('2024-09-03', { inclusive: true })).toBe('2024-09-03');
  });

  it('gives up when every day is a non working day', () => {
    const closed = new Calendar({ weekend: [0, 1, 2, 3, 4, 5, 6] });
    expect(() => closed.nextBusinessDay('2024-01-01')).toThrow(/no business day/);
    expect(() => closed.previousBusinessDay('2024-01-01')).toThrow(/no business day/);
  });

  it('counts forward by business days from the day after', () => {
    expect(calendar.addBusinessDays('2024-08-29', 2)).toBe('2024-09-03');
    expect(calendar.addBusinessDays('2024-03-18', 0)).toBe('2024-03-18');
  });

  it('counts backward by business days', () => {
    expect(calendar.addBusinessDays('2024-09-04', -2)).toBe('2024-08-30');
  });

  it('rejects a fractional business day count', () => {
    expect(() => calendar.addBusinessDays('2024-01-02', 1.5)).toThrow(/integer/);
  });

  it('counts the business days in a span', () => {
    expect(calendar.businessDaysBetween('2024-08-29', '2024-09-05')).toBe(4);
    expect(calendar.businessDaysBetween('2024-08-29', '2024-08-29')).toBe(0);
    expect(calendar.businessDaysBetween('2024-09-05', '2024-08-29')).toBe(-4);
  });
});
