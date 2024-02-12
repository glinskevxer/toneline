/**
 * Business day calendars.
 *
 * A one call centre publishes the days it does not count towards a lawful start
 * waiting period. Those days are the weekend plus a published holiday list, and
 * every jurisdiction observes a slightly different list, so the calendar is
 * built from configuration rather than hard coded.
 */

import { ScheduleError } from '../core/errors.js';
import { addDays, daysInMonth, formatDate, parseDate, toDayNumber, weekday } from './date.js';

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Turn a weekday name or index into an index, rejecting anything else. */
export function weekdayIndex(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 6) return value;
  if (typeof value === 'string') {
    const found = WEEKDAY_NAMES.indexOf(value.trim().toLowerCase());
    if (found >= 0) return found;
  }
  throw new ScheduleError('weekday must be a name or an index from 0 to 6', { value });
}

/**
 * Resolve one holiday rule to the date it falls on in a given year.
 *
 * Two rule shapes are supported. A fixed rule names a month and a day and may
 * ask to be observed on the nearest weekday when it lands on a weekend. An nth
 * weekday rule names a month, a weekday and an ordinal, where -1 means the last
 * such weekday of the month.
 */
export function resolveHoliday(rule, year) {
  if (!rule || typeof rule !== 'object') {
    throw new ScheduleError('holiday rule must be an object', { rule });
  }
  if (!Number.isInteger(year)) {
    throw new ScheduleError('holiday year must be an integer', { year });
  }
  if (rule.kind === 'fixed') {
    return resolveFixed(rule, year);
  }
  if (rule.kind === 'nth-weekday') {
    return resolveNthWeekday(rule, year);
  }
  throw new ScheduleError('holiday rule kind is not recognised', { kind: rule.kind });
}

function resolveFixed(rule, year) {
  const { month, day, observed = 'none' } = rule;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ScheduleError('fixed holiday needs a month from 1 to 12', { rule });
  }
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    throw new ScheduleError('fixed holiday needs a day inside the month', { rule, year });
  }
  const date = formatDate(year, month, day);
  if (observed === 'none') return date;
  if (observed !== 'nearest-weekday') {
    throw new ScheduleError('observed rule is not recognised', { observed });
  }
  const dow = weekday(date);
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

function resolveNthWeekday(rule, year) {
  const { month, nth } = rule;
  const dow = weekdayIndex(rule.weekday);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ScheduleError('nth weekday holiday needs a month from 1 to 12', { rule });
  }
  if (!Number.isInteger(nth) || nth === 0 || nth > 5 || nth < -1) {
    throw new ScheduleError('nth must be 1 through 5 or -1 for the last', { rule });
  }
  const last = daysInMonth(year, month);
  if (nth === -1) {
    for (let day = last; day >= 1; day -= 1) {
      const date = formatDate(year, month, day);
      if (weekday(date) === dow) return date;
    }
  }
  let seen = 0;
  for (let day = 1; day <= last; day += 1) {
    const date = formatDate(year, month, day);
    if (weekday(date) === dow) {
      seen += 1;
      if (seen === nth) return date;
    }
  }
  throw new ScheduleError('the month does not contain that many of the weekday', { rule, year });
}

/** A weekend and holiday calendar for one jurisdiction. */
export class Calendar {
  /**
   * @param {object} [options]
   * @param {Array<string|number>} [options.weekend] non working weekdays
   * @param {Array<object>} [options.holidays] holiday rules
   * @param {string} [options.name] label used in diagnostics
   */
  constructor(options = {}) {
    const { weekend = ['saturday', 'sunday'], holidays = [], name = 'default' } = options;
    if (!Array.isArray(weekend)) {
      throw new ScheduleError('weekend must be an array of weekdays', { weekend });
    }
    if (!Array.isArray(holidays)) {
      throw new ScheduleError('holidays must be an array of rules', { holidays });
    }
    this.name = name;
    this.weekend = new Set(weekend.map(weekdayIndex));
    this.holidayRules = holidays;
    this.cache = new Map();
  }

  /** Every observed holiday in a year, as a map of date to holiday name. */
  holidaysIn(year) {
    const cached = this.cache.get(year);
    if (cached) return cached;
    const resolved = new Map();
    for (const rule of this.holidayRules) {
      const date = resolveHoliday(rule, year);
      resolved.set(date, rule.name ?? 'holiday');
    }
    this.cache.set(year, resolved);
    return resolved;
  }

  /** The name of the holiday falling on a date, or null when it is not one. */
  holidayName(date) {
    const { year } = parseDate(date);
    return this.holidaysIn(year).get(date) ?? null;
  }

  /** True when the date is neither a weekend day nor an observed holiday. */
  isBusinessDay(date) {
    if (this.weekend.has(weekday(date))) return false;
    return this.holidayName(date) === null;
  }

  /** The first business day on or after the given date. */
  nextBusinessDay(date, { inclusive = false } = {}) {
    let cursor = inclusive ? date : addDays(date, 1);
    for (let guard = 0; guard < 400; guard += 1) {
      if (this.isBusinessDay(cursor)) return cursor;
      cursor = addDays(cursor, 1);
    }
    throw new ScheduleError('no business day found within a year', { date, calendar: this.name });
  }

  /** The last business day on or before the given date. */
  previousBusinessDay(date, { inclusive = false } = {}) {
    let cursor = inclusive ? date : addDays(date, -1);
    for (let guard = 0; guard < 400; guard += 1) {
      if (this.isBusinessDay(cursor)) return cursor;
      cursor = addDays(cursor, -1);
    }
    throw new ScheduleError('no business day found within a year', { date, calendar: this.name });
  }

  /**
   * Move forward or back by a count of business days. Counting starts from the
   * day after the given date, which is how a waiting period is stated.
   */
  addBusinessDays(date, count) {
    if (!Number.isInteger(count)) {
      throw new ScheduleError('business day count must be an integer', { count });
    }
    let cursor = date;
    const step = count < 0 ? -1 : 1;
    let remaining = Math.abs(count);
    while (remaining > 0) {
      cursor = addDays(cursor, step);
      if (this.isBusinessDay(cursor)) remaining -= 1;
    }
    return cursor;
  }

  /** Business days strictly after `from` and up to and including `to`. */
  businessDaysBetween(from, to) {
    const start = toDayNumber(from);
    const end = toDayNumber(to);
    if (end === start) return 0;
    const step = end > start ? 1 : -1;
    let counted = 0;
    let cursor = from;
    while (toDayNumber(cursor) !== end) {
      cursor = addDays(cursor, step);
      if (this.isBusinessDay(cursor)) counted += step;
    }
    return counted;
  }
}
