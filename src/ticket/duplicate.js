/**
 * Duplicate digs.
 *
 * An excavator who calls twice, or two crews from the same contractor working
 * the same block, produce separate ticket numbers for one hole in the ground.
 * Marking it twice costs a visit, so the desk scores likely duplicates and the
 * dispatcher decides.
 */

import { normaliseStreet, placeKey } from '../text/address.js';
import { daysBetween } from '../time/date.js';
import { dateOf } from '../time/stamp.js';
import { ringBounds } from '../geo/polygon.js';
import { boundsOverlap } from '../geo/bbox.js';
import { workAreaFor } from './site.js';
import { siteKey } from './record.js';

/** How much each signal is worth, and how close in time a pair has to be. */
export const DEFAULT_DUPLICATE_POLICY = Object.freeze({
  withinDays: 14,
  siteWeight: 0.4,
  excavatorWeight: 0.25,
  workTypeWeight: 0.15,
  geometryWeight: 0.2,
  threshold: 0.6,
});

/** Merge a partial duplicate policy over the defaults. */
export function duplicatePolicy(overrides = {}) {
  return Object.freeze({ ...DEFAULT_DUPLICATE_POLICY, ...overrides });
}

/** True when two tickets are close enough in time to be the same dig. */
export function withinWindow(left, right, policy = DEFAULT_DUPLICATE_POLICY) {
  const gap = Math.abs(daysBetween(dateOf(left.takenAt), dateOf(right.takenAt)));
  return gap <= policy.withinDays;
}

/**
 * True when the two work areas overlap at all.
 *
 * The site policy is passed under its own key rather than as `policy`, because
 * every caller here is already carrying a duplicate policy under that name and
 * handing the wrong one to the work area builder leaves it with no radius.
 */
export function areasOverlap(left, right, options = {}) {
  const leftArea = workAreaFor(left, { policy: options.site });
  const rightArea = workAreaFor(right, { policy: options.site });
  if (leftArea.ring === null || rightArea.ring === null) return false;
  return boundsOverlap(ringBounds(leftArea.ring), ringBounds(rightArea.ring));
}

/**
 * Score how likely it is that two tickets describe one dig.
 *
 * @returns {{score: number, signals: string[]}} the score from zero to one and
 *   the signals that contributed
 */
export function duplicateScore(left, right, options = {}) {
  const policy = options.policy ?? DEFAULT_DUPLICATE_POLICY;
  if (left.base === right.base) return { score: 0, signals: ['same excavation'] };
  if (!withinWindow(left, right, policy)) return { score: 0, signals: ['too far apart in time'] };

  let score = 0;
  const signals = [];
  if (siteKey(left) === siteKey(right)) {
    score += policy.siteWeight;
    signals.push('same site');
  } else if (
    left.address !== null &&
    right.address !== null &&
    normaliseStreet(placeKey(left.address)) === normaliseStreet(placeKey(right.address))
  ) {
    score += policy.siteWeight / 2;
    signals.push('same address');
  }
  const leftCompany = left.excavator?.company ?? null;
  const rightCompany = right.excavator?.company ?? null;
  if (leftCompany !== null && rightCompany !== null && sameCompany(leftCompany, rightCompany)) {
    score += policy.excavatorWeight;
    signals.push('same excavator');
  }
  if (
    left.workType !== null &&
    right.workType !== null &&
    normaliseStreet(left.workType) === normaliseStreet(right.workType)
  ) {
    score += policy.workTypeWeight;
    signals.push('same work type');
  }
  if (areasOverlap(left, right, options)) {
    score += policy.geometryWeight;
    signals.push('work areas overlap');
  }
  return { score: Math.min(1, score), signals };
}

function sameCompany(left, right) {
  return (
    normaliseStreet(left)
      .replace(/\b(INC|LLC|CO)\b/g, '')
      .trim() ===
    normaliseStreet(right)
      .replace(/\b(INC|LLC|CO)\b/g, '')
      .trim()
  );
}

/**
 * Find likely duplicates of a ticket among a set of candidates.
 *
 * @returns {Array<{number: string, score: number, signals: string[]}>} highest first
 */
export function findDuplicates(ticket, candidates, options = {}) {
  const policy = options.policy ?? DEFAULT_DUPLICATE_POLICY;
  const found = [];
  for (const candidate of candidates) {
    const { score, signals } = duplicateScore(ticket, candidate, options);
    if (score >= policy.threshold) {
      found.push({ number: candidate.number, score, signals });
    }
  }
  return found.sort(
    (left, right) => right.score - left.score || left.number.localeCompare(right.number)
  );
}

/** Group a set of tickets into clusters that look like one dig each. */
export function groupDuplicates(tickets, options = {}) {
  const groups = [];
  const placed = new Set();
  for (const ticket of tickets) {
    if (placed.has(ticket.number)) continue;
    const group = [ticket];
    placed.add(ticket.number);
    for (const other of tickets) {
      if (placed.has(other.number)) continue;
      if (group.some((held) => findDuplicates(held, [other], options).length > 0)) {
        group.push(other);
        placed.add(other.number);
      }
    }
    groups.push(group);
  }
  return groups;
}
