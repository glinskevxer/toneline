/**
 * The locator roster.
 *
 * Who is available, what they are qualified to locate, which districts they
 * cover and how much work they can take in a day. A locator qualified on gas
 * cannot answer an electric ticket, and the dispatcher has to know that before
 * it starts handing work out.
 */

import { TonelineError } from '../core/errors.js';
import {
  deepFreeze,
  normaliseCode,
  optionalBoolean,
  optionalList,
  optionalString,
  requireInteger,
  requireString,
} from '../core/fields.js';
import { parseClockTime } from '../time/stamp.js';
import { facilityType } from '../ticket/types.js';

/** Raised when a locator record cannot be used. */
export class RosterError extends TonelineError {
  constructor(message, details = {}) {
    super('ROSTER_INVALID', message, details);
  }
}

/** Build a locator from a loose record. */
export function buildLocator(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new RosterError('a locator must be built from an object', { type: typeof raw });
  }
  const id = requireString(raw.id, 'id').toUpperCase();
  const skills = optionalList(raw.skills, 'skills').map((code) => {
    try {
      return facilityType(code).code;
    } catch {
      throw new RosterError('a locator skill has to be a facility type', { id, skill: code });
    }
  });
  if (skills.length === 0) {
    throw new RosterError('a locator needs at least one skill', { id });
  }
  const shift = readShift(raw.shift, id);
  const dailyCapacity =
    raw.dailyCapacity === undefined ? 12 : requireInteger(raw.dailyCapacity, 'dailyCapacity');
  if (dailyCapacity < 1) {
    throw new RosterError('a locator has to be able to take at least one ticket', {
      id,
      dailyCapacity,
    });
  }
  return deepFreeze({
    id,
    name: optionalString(raw.name, 'name', id),
    skills,
    districts: optionalList(raw.districts, 'districts').map((code) => normaliseCode(code)),
    shift,
    dailyCapacity,
    onCall: optionalBoolean(raw.onCall, 'onCall'),
    active: raw.active === undefined ? true : optionalBoolean(raw.active, 'active', true),
    base: raw.base ?? null,
  });
}

function readShift(value, id) {
  if (value === null || value === undefined) return { open: 420, close: 1020 };
  if (typeof value !== 'object') {
    throw new RosterError('a shift must be an object with start and end', { id });
  }
  const open = parseClockTime(value.start ?? value.open ?? '');
  const close = parseClockTime(value.end ?? value.close ?? '');
  if (close <= open) {
    throw new RosterError('a shift has to end after it starts', { id, value });
  }
  return { open, close };
}

/** True when the locator can answer that facility type. */
export function hasSkill(locator, type) {
  return locator.skills.includes(facilityType(type).code);
}

/** True when the locator covers that district. */
export function coversDistrict(locator, district) {
  if (locator.districts.length === 0) return true;
  return locator.districts.includes(normaliseCode(district));
}

/** True when the locator is on shift at that minute of the day. */
export function onShiftAt(locator, minuteOfDay) {
  return minuteOfDay >= locator.shift.open && minuteOfDay < locator.shift.close;
}

/** Everyone who can answer a ticket needing these facility types. */
export function qualifiedFor(roster, types, district = null) {
  const wanted = types.map((type) => facilityType(type).code);
  return roster.filter((locator) => {
    if (!locator.active) return false;
    if (district !== null && !coversDistrict(locator, district)) return false;
    return wanted.every((type) => hasSkill(locator, type));
  });
}

/** Build a roster, refusing a repeated id. */
export function buildRoster(records) {
  const roster = [];
  const seen = new Set();
  for (const record of records ?? []) {
    const locator = buildLocator(record);
    if (seen.has(locator.id)) {
      throw new RosterError('two locators share an id', { id: locator.id });
    }
    seen.add(locator.id);
    roster.push(locator);
  }
  return roster;
}

/** Look a locator up by id. */
export function locatorById(roster, id) {
  const wanted = normaliseCode(id);
  return roster.find((locator) => locator.id === wanted) ?? null;
}
