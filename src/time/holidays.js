/**
 * Holiday presets.
 *
 * Every operator in the same state observes very nearly the same list, and
 * retyping it into each configuration is how one desk ends up counting a
 * business day the others do not. A configuration names a preset and adds or
 * drops the one or two days it differs on.
 */

import { ScheduleError } from '../core/errors.js';
import { normaliseCode } from '../core/fields.js';

const FEDERAL = [
  { kind: 'fixed', month: 1, day: 1, name: 'new year', observed: 'nearest-weekday' },
  { kind: 'nth-weekday', month: 1, weekday: 'monday', nth: 3, name: 'martin luther king day' },
  { kind: 'nth-weekday', month: 2, weekday: 'monday', nth: 3, name: 'presidents day' },
  { kind: 'nth-weekday', month: 5, weekday: 'monday', nth: -1, name: 'memorial day' },
  { kind: 'fixed', month: 6, day: 19, name: 'juneteenth', observed: 'nearest-weekday' },
  { kind: 'fixed', month: 7, day: 4, name: 'independence day', observed: 'nearest-weekday' },
  { kind: 'nth-weekday', month: 9, weekday: 'monday', nth: 1, name: 'labour day' },
  { kind: 'nth-weekday', month: 10, weekday: 'monday', nth: 2, name: 'columbus day' },
  { kind: 'fixed', month: 11, day: 11, name: 'veterans day', observed: 'nearest-weekday' },
  { kind: 'nth-weekday', month: 11, weekday: 'thursday', nth: 4, name: 'thanksgiving' },
  { kind: 'fixed', month: 12, day: 25, name: 'christmas', observed: 'nearest-weekday' },
];

const UTILITY = FEDERAL.filter(
  (rule) =>
    !['martin luther king day', 'presidents day', 'columbus day', 'veterans day'].includes(
      rule.name
    )
);

const PRESETS = new Map([
  ['FEDERAL', FEDERAL],
  ['UTILITY', UTILITY],
  ['NONE', []],
]);

/** The presets this build ships. */
export const HOLIDAY_PRESETS = Object.freeze([...PRESETS.keys()]);

/** The rules behind a preset, as a fresh copy each time. */
export function holidayPreset(name) {
  const rules = PRESETS.get(normaliseCode(name));
  if (rules === undefined) {
    throw new ScheduleError('that is not a holiday preset we ship', {
      name,
      known: HOLIDAY_PRESETS,
    });
  }
  return rules.map((rule) => ({ ...rule }));
}

/**
 * Build a holiday list from a preset plus the operator's own changes.
 *
 * @param {object} [options]
 * @param {string} [options.preset] the preset to start from
 * @param {object[]} [options.add] extra rules
 * @param {string[]} [options.drop] names to leave out
 */
export function holidayList({ preset = 'UTILITY', add = [], drop = [] } = {}) {
  const dropped = new Set(drop.map((name) => String(name).toLowerCase()));
  const kept = holidayPreset(preset).filter((rule) => !dropped.has(rule.name.toLowerCase()));
  const names = new Set(kept.map((rule) => rule.name.toLowerCase()));
  for (const rule of add) {
    if (!rule || typeof rule !== 'object' || typeof rule.name !== 'string') {
      throw new ScheduleError('an added holiday needs a name and a rule', { rule });
    }
    if (names.has(rule.name.toLowerCase())) {
      throw new ScheduleError('that holiday is already in the list', { name: rule.name });
    }
    names.add(rule.name.toLowerCase());
    kept.push({ ...rule });
  }
  return kept;
}

/** The names in a holiday list, in order. */
export function holidayNames(rules) {
  return rules.map((rule) => rule.name);
}
