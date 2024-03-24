/**
 * Centre date and time formats.
 *
 * Transmissions carry dates the way a call taker types them, which is month
 * first with two or four digit years, and times either as `07:42`, as `0742` or
 * with a meridiem. Everything is converted to the library's own civil forms on
 * the way in and back to the centre's form on the way out.
 */

import { ScheduleError } from '../core/errors.js';
import { formatDate, parseDate } from './date.js';
import { formatStamp, parseStamp } from './stamp.js';

const US_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLON_TIME = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/;
const PACKED_TIME = /^(\d{3,4})\s*([AaPp][Mm])?$/;

/** Turn a two digit year into a four digit one, pivoting at 70. */
export function expandYear(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ScheduleError('year must be a whole number', { value });
  }
  if (value >= 100) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

/** Read a centre date into the library's civil date form. */
export function parseCentreDate(value) {
  if (typeof value !== 'string') {
    throw new ScheduleError('centre date must be a string', { value });
  }
  const text = value.trim();
  if (ISO_DATE.test(text)) {
    parseDate(text);
    return text;
  }
  const match = US_DATE.exec(text);
  if (!match) {
    throw new ScheduleError('centre date is not in a form the desk reads', { value });
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = expandYear(Number(match[3]));
  const iso = formatDate(year, month, day);
  parseDate(iso);
  return iso;
}

/** Read a centre time into a minute of day. */
export function parseCentreTime(value) {
  if (typeof value !== 'string') {
    throw new ScheduleError('centre time must be a string', { value });
  }
  const text = value.trim();
  const colon = COLON_TIME.exec(text);
  const packed = colon ? null : PACKED_TIME.exec(text);
  if (!colon && !packed) {
    throw new ScheduleError('centre time is not in a form the desk reads', { value });
  }
  let hour;
  let minute;
  let meridiem;
  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
    meridiem = colon[3];
  } else {
    const digits = packed[1].padStart(4, '0');
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2));
    meridiem = packed[2];
  }
  if (meridiem) {
    const isAfternoon = meridiem.toUpperCase() === 'PM';
    if (hour < 1 || hour > 12) {
      throw new ScheduleError('a twelve hour time needs an hour from 1 to 12', { value });
    }
    if (hour === 12) hour = isAfternoon ? 12 : 0;
    else if (isAfternoon) hour += 12;
  }
  if (hour > 23 || minute > 59) {
    throw new ScheduleError('centre time is outside the day', { value });
  }
  return hour * 60 + minute;
}

/** Read a centre date and time into the library's timestamp form. */
export function parseCentreStamp(value) {
  if (typeof value !== 'string') {
    throw new ScheduleError('centre timestamp must be a string', { value });
  }
  const text = value.trim();
  const split = text.split(/\s+/);
  if (split.length === 1) {
    return formatStamp(parseCentreDate(split[0]), 0);
  }
  const date = parseCentreDate(split[0]);
  const time = split.slice(1).join(' ');
  return formatStamp(date, parseCentreTime(time));
}

/** Render a civil date the way the centre prints it. */
export function formatCentreDate(value) {
  const { year, month, day } = parseDate(value);
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

/** Render a timestamp the way the centre prints it. */
export function formatCentreStamp(value) {
  const { date, hour, minute } = parseStamp(value);
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return `${formatCentreDate(date)} ${clock}`;
}
