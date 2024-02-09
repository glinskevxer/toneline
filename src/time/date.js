/**
 * Civil date arithmetic.
 *
 * Locate work is scheduled against calendar days in the operator's own
 * jurisdiction, never against instants, so every date in the library is the
 * string `YYYY-MM-DD` and every helper here treats it as a bare civil date.
 * Working through UTC keeps a machine running in a summer time zone from
 * shifting a date by a day.
 */

import { ScheduleError } from '../core/errors.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

/** Split a civil date into numeric parts, rejecting anything that is not one. */
export function parseDate(value) {
  if (typeof value !== 'string') {
    throw new ScheduleError('date must be a string in YYYY-MM-DD form', { value });
  }
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new ScheduleError('date must be in YYYY-MM-DD form', { value });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new ScheduleError('month is outside the calendar', { value });
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new ScheduleError('day is outside the month', { value });
  }
  return { year, month, day };
}

/** True when the civil date string is well formed and real. */
export function isDate(value) {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Number of days in a month, honouring the leap rule. */
export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** True for a Gregorian leap year. */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Build a civil date string from parts. */
export function formatDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whole days since the epoch, used as the canonical ordering key. */
export function toDayNumber(value) {
  const { year, month, day } = parseDate(value);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Inverse of {@link toDayNumber}. */
export function fromDayNumber(dayNumber) {
  if (!Number.isInteger(dayNumber)) {
    throw new ScheduleError('day number must be an integer', { dayNumber });
  }
  const utc = new Date(dayNumber * MS_PER_DAY);
  return formatDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/** Move a civil date by a whole number of days in either direction. */
export function addDays(value, days) {
  if (!Number.isInteger(days)) {
    throw new ScheduleError('day offset must be an integer', { days });
  }
  return fromDayNumber(toDayNumber(value) + days);
}

/** Signed day count from the first date to the second. */
export function daysBetween(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

/** Day of the week, 0 for Sunday through 6 for Saturday. */
export function weekday(value) {
  return (((toDayNumber(value) + 4) % 7) + 7) % 7;
}

/** Compare two civil dates, returning the usual negative, zero or positive. */
export function compareDates(left, right) {
  return toDayNumber(left) - toDayNumber(right);
}

/** The earlier of two civil dates. */
export function minDate(left, right) {
  return compareDates(left, right) <= 0 ? left : right;
}

/** The later of two civil dates. */
export function maxDate(left, right) {
  return compareDates(left, right) >= 0 ? left : right;
}

/** Every date from `from` through `to`, inclusive at both ends. */
export function eachDate(from, to) {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  if (end < start) {
    throw new ScheduleError('date range runs backwards', { from, to });
  }
  const out = [];
  for (let n = start; n <= end; n += 1) out.push(fromDayNumber(n));
  return out;
}
