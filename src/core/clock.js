/**
 * Telling the time.
 *
 * Almost nothing in this library asks what time it is: a timestamp is passed
 * in, because a calculation that reads the wall clock cannot be tested and
 * cannot be replayed. The two places that genuinely need now are the command
 * line and the audit trail, and they take a clock rather than calling `Date`.
 */

import { TonelineError } from './errors.js';
import { formatStamp } from '../time/stamp.js';

/** Raised when a clock cannot be used. */
export class ClockError extends TonelineError {
  constructor(message, details = {}) {
    super('CLOCK_INVALID', message, details);
  }
}

/** Round a native date down to the minute, in local wall clock terms. */
export function stampFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new ClockError('a clock needs a real date', { value: String(date) });
  }
  const civil = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return formatStamp(civil, date.getHours() * 60 + date.getMinutes());
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** A clock reading the machine's own wall clock. */
export function systemClock() {
  return { now: () => stampFromDate(new Date()) };
}

/**
 * A clock that stays where it was put.
 *
 * Useful anywhere a run has to be repeatable: a replay, a test, a report built
 * as at a moment that has already passed.
 */
export function fixedClock(stamp) {
  const held = String(stamp ?? '');
  formatStamp(held.slice(0, 10), 0);
  return { now: () => held };
}

/**
 * A clock that steps forward every time it is read.
 *
 * The step is in minutes, and it is there so a sequence of events written in
 * one loop does not all land on the same minute and lose its order.
 */
export function steppingClock(start, minutesPerRead = 1) {
  if (!Number.isInteger(minutesPerRead) || minutesPerRead < 0) {
    throw new ClockError('a stepping clock needs a whole number of minutes', { minutesPerRead });
  }
  let reads = 0;
  return {
    now: () => {
      const at = addMinutesTo(start, reads * minutesPerRead);
      reads += 1;
      return at;
    },
  };
}

function addMinutesTo(stamp, minutes) {
  const [date, clock] = String(stamp).split('T');
  const [hour, minute] = clock.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const days = Math.floor(total / 1440);
  const rest = total - days * 1440;
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatStamp(shifted.toISOString().slice(0, 10), rest);
}

/** Read a clock, checking it is one. */
export function readClock(clock) {
  if (!clock || typeof clock.now !== 'function') {
    throw new ClockError('that is not a clock', { type: typeof clock });
  }
  return clock.now();
}
