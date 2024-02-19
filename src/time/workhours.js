/**
 * Working hour schedules.
 *
 * Some response clocks run around the clock and some only run while the locate
 * desk is open. A schedule pairs a {@link Calendar} with an open window per
 * weekday, and the two helpers here move a timestamp forward by working minutes
 * and measure the working minutes between two timestamps.
 */

import { ScheduleError } from '../core/errors.js';
import { Calendar, weekdayIndex } from './calendar.js';
import { addDays, weekday } from './date.js';
import {
  compareStamps,
  dateOf,
  formatStamp,
  parseClockTime,
  parseStamp,
  toMinuteNumber,
} from './stamp.js';

const MINUTES_PER_DAY = 1440;
const MAX_DAYS_SEARCHED = 400;

/** A weekly pattern of open windows sitting on top of a holiday calendar. */
export class WorkSchedule {
  /**
   * @param {object} [options]
   * @param {object} [options.hours] map of weekday to `{ open, close }` in HH:MM
   * @param {Calendar} [options.calendar] holiday calendar to sit on
   * @param {string} [options.name] label used in diagnostics
   */
  constructor(options = {}) {
    const {
      hours = {
        monday: { open: '07:00', close: '17:00' },
        tuesday: { open: '07:00', close: '17:00' },
        wednesday: { open: '07:00', close: '17:00' },
        thursday: { open: '07:00', close: '17:00' },
        friday: { open: '07:00', close: '17:00' },
      },
      calendar = new Calendar(),
      name = 'desk',
    } = options;
    if (!(calendar instanceof Calendar)) {
      throw new ScheduleError('schedule needs a Calendar instance', { name });
    }
    this.name = name;
    this.calendar = calendar;
    this.windows = new Map();
    for (const [day, window] of Object.entries(hours)) {
      const index = weekdayIndex(day);
      const open = parseClockTime(window?.open ?? '');
      const close = parseClockTime(window?.close ?? '');
      if (close <= open) {
        throw new ScheduleError('a working window must close after it opens', { day, window });
      }
      this.windows.set(index, { open, close });
    }
    if (this.windows.size === 0) {
      throw new ScheduleError('schedule has no working windows at all', { name });
    }
  }

  /** The open window on a date, or null when the desk is shut that day. */
  windowOn(date) {
    if (!this.calendar.isBusinessDay(date)) return null;
    return this.windows.get(weekday(date)) ?? null;
  }

  /** True when the desk is open at that exact minute. */
  isOpen(stamp) {
    const { date, minuteOfDay } = parseStamp(stamp);
    const window = this.windowOn(date);
    if (!window) return false;
    return minuteOfDay >= window.open && minuteOfDay < window.close;
  }

  /** The first open minute at or after the given timestamp. */
  nextOpen(stamp) {
    const { date, minuteOfDay } = parseStamp(stamp);
    let cursor = date;
    let from = minuteOfDay;
    for (let guard = 0; guard < MAX_DAYS_SEARCHED; guard += 1) {
      const window = this.windowOn(cursor);
      if (window && from < window.close) {
        return formatStamp(cursor, Math.max(from, window.open));
      }
      cursor = addDays(cursor, 1);
      from = 0;
    }
    throw new ScheduleError('the desk never opens again within a year', { stamp, name: this.name });
  }

  /**
   * Move forward by working minutes, skipping every closed stretch. Landing
   * exactly on a closing time rolls on to the next open minute, so a deadline
   * is always a minute the desk is actually staffed.
   */
  addWorkingMinutes(stamp, minutes) {
    if (!Number.isInteger(minutes) || minutes < 0) {
      throw new ScheduleError('working minutes must be a whole number at or above zero', {
        minutes,
      });
    }
    let cursor = this.nextOpen(stamp);
    let remaining = minutes;
    for (let guard = 0; guard < MAX_DAYS_SEARCHED; guard += 1) {
      const { date, minuteOfDay } = parseStamp(cursor);
      const window = this.windowOn(date);
      const available = window.close - minuteOfDay;
      if (remaining < available) {
        return formatStamp(date, minuteOfDay + remaining);
      }
      remaining -= available;
      cursor = this.nextOpen(formatStamp(addDays(date, 1), 0));
      if (remaining === 0) return cursor;
    }
    throw new ScheduleError('working minutes did not resolve within a year', { stamp, minutes });
  }

  /** Move forward by working hours. */
  addWorkingHours(stamp, hours) {
    if (!Number.isInteger(hours) || hours < 0) {
      throw new ScheduleError('working hours must be a whole number at or above zero', { hours });
    }
    return this.addWorkingMinutes(stamp, hours * 60);
  }

  /** Working minutes between two timestamps, zero when they run backwards. */
  workingMinutesBetween(from, to) {
    if (compareStamps(from, to) >= 0) return 0;
    const begin = toMinuteNumber(from);
    const end = toMinuteNumber(to);
    let counted = 0;
    let cursor = dateOf(from);
    for (let guard = 0; guard < MAX_DAYS_SEARCHED; guard += 1) {
      const window = this.windowOn(cursor);
      if (window) {
        const opensAt = toMinuteNumber(formatStamp(cursor, window.open));
        const closesAt = opensAt + (window.close - window.open);
        const start = Math.max(opensAt, begin);
        const stop = Math.min(closesAt, end);
        if (stop > start) counted += stop - start;
      }
      const dayEnd = toMinuteNumber(formatStamp(cursor, MINUTES_PER_DAY - 1));
      if (dayEnd >= end) break;
      cursor = addDays(cursor, 1);
    }
    return counted;
  }

  /** Total working minutes available on one date. */
  minutesAvailableOn(date) {
    const window = this.windowOn(date);
    return window ? window.close - window.open : 0;
  }
}
