/**
 * Whether the day fits.
 *
 * Assignment answers "who takes this ticket". Capacity answers the question
 * before it: is there enough of the right sort of locator to answer everything
 * that has landed. A day that does not fit has to be known about in the morning
 * and not at four in the afternoon.
 */

import { deepFreeze, normaliseCode } from '../core/fields.js';
import { dateOf } from '../time/stamp.js';
import { conflictingTypes } from '../screening/screen.js';
import { hasSkill, coversDistrict } from './locator.js';
import { loadOn } from './assign.js';

/**
 * What one day needs, by skill and by district.
 *
 * @param {Array<{ticket: object, screening: object}>} entries
 * @returns {{tickets: number, byType: object, byDistrict: object}}
 */
export function demandFor(entries) {
  const byType = {};
  const byDistrict = {};
  for (const { screening } of entries) {
    if (!screening.ours) continue;
    for (const type of conflictingTypes(screening)) {
      byType[type] = (byType[type] ?? 0) + 1;
    }
    const district = screening.districts.length > 0 ? screening.districts[0] : 'UNPLACED';
    byDistrict[district] = (byDistrict[district] ?? 0) + 1;
  }
  return {
    tickets: entries.filter((entry) => entry.screening.ours).length,
    byType,
    byDistrict,
  };
}

/**
 * What a roster can take on a day, net of what it already holds.
 *
 * @param {object[]} roster
 * @param {object} [options]
 * @param {object[]} [options.assignments] what has already been handed out
 * @param {string} [options.date] the day being planned
 */
export function supplyFrom(roster, { assignments = [], date } = {}) {
  const byType = {};
  const byDistrict = {};
  let total = 0;
  for (const locator of roster) {
    if (!locator.active) continue;
    const held = date === undefined ? 0 : loadOn(assignments, locator.id, date);
    const free = Math.max(0, locator.dailyCapacity - held);
    total += free;
    for (const skill of locator.skills) {
      byType[skill] = (byType[skill] ?? 0) + free;
    }
    const districts = locator.districts.length === 0 ? ['ANY'] : locator.districts;
    for (const district of districts) {
      byDistrict[district] = (byDistrict[district] ?? 0) + free;
    }
  }
  return { total, byType, byDistrict };
}

/**
 * Compare what a day needs with what the roster can take.
 *
 * @returns {object} a frozen plan with the shortfalls named
 */
export function planDay(entries, roster, options = {}) {
  const date = options.date ?? (entries.length > 0 ? dateOf(entries[0].ticket.receivedAt) : null);
  const demand = demandFor(entries);
  const supply = supplyFrom(roster, { ...options, date });
  const shortfalls = [];

  if (demand.tickets > supply.total) {
    shortfalls.push({
      kind: 'total',
      needed: demand.tickets,
      available: supply.total,
      short: demand.tickets - supply.total,
    });
  }
  for (const [type, needed] of Object.entries(demand.byType)) {
    const available = supply.byType[type] ?? 0;
    if (needed > available) {
      shortfalls.push({ kind: 'skill', name: type, needed, available, short: needed - available });
    }
  }
  for (const [district, needed] of Object.entries(demand.byDistrict)) {
    const available = (supply.byDistrict[district] ?? 0) + (supply.byDistrict.ANY ?? 0);
    if (needed > available) {
      shortfalls.push({
        kind: 'district',
        name: district,
        needed,
        available,
        short: needed - available,
      });
    }
  }
  return deepFreeze({
    date,
    demand,
    supply,
    shortfalls: shortfalls.sort((left, right) => right.short - left.short),
    fits: shortfalls.length === 0,
  });
}

/** Who could take more work of a given kind. */
export function whoIsFree(roster, { type = null, district = null, assignments = [], date }) {
  return roster
    .filter((locator) => locator.active)
    .filter((locator) => type === null || hasSkill(locator, type))
    .filter((locator) => district === null || coversDistrict(locator, district))
    .map((locator) => ({
      locatorId: locator.id,
      free: Math.max(0, locator.dailyCapacity - loadOn(assignments, locator.id, date)),
    }))
    .filter((entry) => entry.free > 0)
    .sort((left, right) => right.free - left.free || left.locatorId.localeCompare(right.locatorId));
}

/** A line per shortfall for the morning brief. */
export function shortfallLines(plan) {
  if (plan.fits) return ['the day fits'];
  return plan.shortfalls.map((entry) => {
    const what = entry.kind === 'total' ? 'in total' : `on ${normaliseCode(entry.name)}`;
    return `${entry.short} short ${what}, ${entry.needed} needed and ${entry.available} available`;
  });
}
