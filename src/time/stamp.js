/**
 * Civil timestamps at minute resolution.
 *
 * Transmissions carry a local wall clock time with no offset, and the response
 * clock is read against the same wall clock, so the library keeps timestamps as
 * `YYYY-MM-DDTHH:MM` and never converts to an instant. Seconds are dropped on
 * the way in because no rule in the domain is stated finer than a minute.
 */

import { ScheduleError } from '../core/errors.js';
import { addDays, formatDate, parseDate, toDayNumber, fromDayNumber } from './date.js';

const STAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;
const MINUTES_PER_DAY = 1440;

/** Split a timestamp into its date and its minute of day. */
export function parseStamp(value) {
  if (typeof value !== 'string') {
    throw new ScheduleError('timestamp must be a string', { value });
  }
  const match = STAMP_PATTERN.exec(value.trim());
  if (!match) {
    throw new ScheduleError('timestamp must be in YYYY-MM-DDTHH:MM form', { value });
  }
  const [, date, hh, mm] = match;
  parseDate(date);
  const hour = Number(hh);
  const minute = Number(mm);
  if (hour > 23 || minute > 59) {
    throw new ScheduleError('timestamp carries an impossible wall clock time', { value });
  }
  return { date, hour, minute, minuteOfDay: hour * 60 + minute };
}

/** True when the value reads as a timestamp. */
export function isStamp(value) {
  try {
    parseStamp(value);
    return true;
  } catch {
    return false;
  }
}

/** Build a timestamp from a date and a minute of day. */
export function formatStamp(date, minuteOfDay) {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= MINUTES_PER_DAY) {
    throw new ScheduleError('minute of day must be from 0 to 1439', { minuteOfDay });
  }
  parseDate(date);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Minutes since the epoch, the canonical ordering key for a timestamp. */
export function toMinuteNumber(value) {
  const { date, minuteOfDay } = parseStamp(value);
  return toDayNumber(date) * MINUTES_PER_DAY + minuteOfDay;
}

/** Inverse of {@link toMinuteNumber}. */
export function fromMinuteNumber(minuteNumber) {
  if (!Number.isInteger(minuteNumber)) {
    throw new ScheduleError('minute number must be an integer', { minuteNumber });
  }
  const dayNumber = Math.floor(minuteNumber / MINUTES_PER_DAY);
  const minuteOfDay = minuteNumber - dayNumber * MINUTES_PER_DAY;
  return formatStamp(fromDayNumber(dayNumber), minuteOfDay);
}

/** Move a timestamp by whole minutes in either direction. */
export function addMinutes(value, minutes) {
  if (!Number.isInteger(minutes)) {
    throw new ScheduleError('minute offset must be an integer', { minutes });
  }
  return fromMinuteNumber(toMinuteNumber(value) + minutes);
}

/** Move a timestamp by whole hours. */
export function addHours(value, hours) {
  if (!Number.isInteger(hours)) {
    throw new ScheduleError('hour offset must be an integer', { hours });
  }
  return addMinutes(value, hours * 60);
}

/** Signed minute count from the first timestamp to the second. */
export function minutesBetween(from, to) {
  return toMinuteNumber(to) - toMinuteNumber(from);
}

/** Signed hour count, rounded down towards zero. */
export function hoursBetween(from, to) {
  return Math.trunc(minutesBetween(from, to) / 60);
}

/** Compare two timestamps, returning the usual negative, zero or positive. */
export function compareStamps(left, right) {
  return toMinuteNumber(left) - toMinuteNumber(right);
}

/** The calendar date part of a timestamp. */
export function dateOf(value) {
  return parseStamp(value).date;
}

/** The wall clock part of a timestamp as `HH:MM`. */
export function timeOf(value) {
  const { hour, minute } = parseStamp(value);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Midnight at the start of the timestamp's own day. */
export function startOfDay(value) {
  return formatStamp(dateOf(value), 0);
}

/** The last minute of the timestamp's own day. */
export function endOfDay(value) {
  return formatStamp(dateOf(value), MINUTES_PER_DAY - 1);
}

/** Parse an `HH:MM` clock time into a minute of day. */
export function parseClockTime(value) {
  if (typeof value !== 'string') {
    throw new ScheduleError('clock time must be a string', { value });
  }
  const match = CLOCK_PATTERN.exec(value.trim());
  if (!match) {
    throw new ScheduleError('clock time must be in HH:MM form', { value });
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new ScheduleError('clock time is outside the day', { value });
  }
  return hour * 60 + minute;
}

/** Render a minute of day as `HH:MM`. */
export function formatClockTime(minuteOfDay) {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= MINUTES_PER_DAY) {
    throw new ScheduleError('minute of day must be from 0 to 1439', { minuteOfDay });
  }
  const hour = Math.floor(minuteOfDay / 60);
  return `${String(hour).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

/** Place a clock time onto a calendar date. */
export function atTime(date, clockTime) {
  return formatStamp(date, parseClockTime(clockTime));
}

/** The same clock time a whole number of days away. */
export function shiftDays(value, days) {
  const { date, minuteOfDay } = parseStamp(value);
  return formatStamp(addDays(date, days), minuteOfDay);
}

/** Midnight on the first day of the timestamp's month. */
export function startOfMonth(value) {
  const { year, month } = parseDate(dateOf(value));
  return formatStamp(formatDate(year, month, 1), 0);
}
