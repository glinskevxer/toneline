/**
 * Damage statistics.
 *
 * The number every operator is measured on is damages per thousand tickets, and
 * on its own it says very little, so the roll up here always carries the split
 * by cause, by facility and by method alongside it.
 */

import { deepFreeze } from '../core/fields.js';
import { dateOf } from '../time/stamp.js';
import { classifyDamage } from './rootCause.js';
import { isReportable } from './report.js';

/** Damages per thousand tickets, the industry's own rate. */
export function damageRate(damageCount, ticketCount) {
  if (!Number.isFinite(damageCount) || damageCount < 0) {
    throw new TypeError('damage count must be a number at or above zero');
  }
  if (!Number.isFinite(ticketCount) || ticketCount <= 0) return 0;
  return (damageCount / ticketCount) * 1000;
}

/** Count damages by whatever key the reader picks out of each one. */
export function countBy(damages, reader) {
  const counts = {};
  for (const damage of damages) {
    const key = String(reader(damage));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** The year and month a damage happened in, as `YYYY-MM`. */
export function monthOf(damage) {
  return dateOf(damage.at).slice(0, 7);
}

/**
 * Roll a period up.
 *
 * @param {object[]} damages the damages in the period
 * @param {object} [options]
 * @param {number} [options.tickets] tickets handled in the same period
 */
export function damageSummary(damages, options = {}) {
  const { tickets = 0 } = options;
  const reportable = damages.filter(isReportable);
  return deepFreeze({
    damages: damages.length,
    reportable: reportable.length,
    tickets,
    ratePerThousand: damageRate(damages.length, tickets),
    byCause: countBy(damages, (damage) => classifyDamage(damage).code),
    byFacility: countBy(damages, (damage) => damage.facilityType),
    byMethod: countBy(damages, (damage) => damage.method),
    byMonth: countBy(damages, monthOf),
    withOutage: damages.filter((damage) => damage.serviceInterrupted).length,
    customersOut: damages.reduce((sum, damage) => sum + damage.customersOut, 0),
    injuries: damages.filter((damage) => damage.injury).length,
  });
}

/** The months in a summary, in order, with their counts. */
export function monthlySeries(summary) {
  return Object.keys(summary.byMonth)
    .sort()
    .map((month) => ({ month, damages: summary.byMonth[month] }));
}

/** The worst entries of a count map, highest first. */
export function topCounts(counts, limit = 3) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Compare two periods.
 *
 * The change in rate is what a board asks about, and it is only meaningful when
 * both periods handled tickets, so it comes back null rather than as a made up
 * zero when either did not.
 */
export function comparePeriods(before, after) {
  const rateChange =
    before.tickets === 0 || after.tickets === 0
      ? null
      : after.ratePerThousand - before.ratePerThousand;
  return deepFreeze({
    damagesBefore: before.damages,
    damagesAfter: after.damages,
    damageChange: after.damages - before.damages,
    rateBefore: before.ratePerThousand,
    rateAfter: after.ratePerThousand,
    rateChange,
    improved: rateChange === null ? null : rateChange < 0,
  });
}
