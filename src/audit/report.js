/**
 * Reading the trail back.
 *
 * The trail is written for machines and read by people, usually under pressure
 * and usually about one ticket. These build the three views that get asked for:
 * the story of one ticket, who did what over a period, and where the gaps are.
 */

import { deepFreeze } from '../core/fields.js';
import { dateOf, minutesBetween } from '../time/stamp.js';
import { formatEntry } from './trail.js';

/** The actions the desk expects to see on a ticket that ran to completion. */
export const EXPECTED_ACTIONS = Object.freeze(['received', 'screened', 'assigned', 'responded']);

/**
 * The story of one ticket.
 *
 * @param {import('./trail.js').AuditTrail} trail
 * @param {string} number the ticket
 * @returns {object} a frozen story
 */
export function ticketStory(trail, number) {
  const entries = trail.forSubject(number);
  const actions = entries.map((entry) => entry.action);
  const missing = EXPECTED_ACTIONS.filter((action) => !actions.includes(action));
  const first = entries.length === 0 ? null : entries[0];
  const last = entries.length === 0 ? null : entries[entries.length - 1];
  return deepFreeze({
    number: String(number ?? '').toUpperCase(),
    entries: entries.length,
    lines: entries.map(formatEntry),
    actors: [...new Set(entries.map((entry) => entry.by))].sort(),
    firstAt: first === null ? null : first.at,
    lastAt: last === null ? null : last.at,
    minutesSpanned: first === null ? 0 : minutesBetween(first.at, last.at),
    missing,
    complete: missing.length === 0,
  });
}

/** Who did what over a window, counted. */
export function actorActivity(trail, from, to) {
  const counts = new Map();
  for (const entry of trail.between(from, to)) {
    const byActor = counts.get(entry.by) ?? {};
    byActor[entry.action] = (byActor[entry.action] ?? 0) + 1;
    counts.set(entry.by, byActor);
  }
  return [...counts.keys()].sort().map((actor) => ({
    actor,
    actions: counts.get(actor),
    total: Object.values(counts.get(actor)).reduce((sum, count) => sum + count, 0),
  }));
}

/** How many entries were written on each day of a window. */
export function dailyVolume(trail, from, to) {
  const days = new Map();
  for (const entry of trail.between(from, to)) {
    const day = dateOf(entry.at);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return [...days.keys()].sort().map((day) => ({ day, entries: days.get(day) }));
}

/**
 * Subjects whose trail is missing something.
 *
 * @param {import('./trail.js').AuditTrail} trail
 * @param {string[]} subjects the tickets to check
 */
export function gaps(trail, subjects) {
  return subjects
    .map((subject) => ticketStory(trail, subject))
    .filter((story) => !story.complete)
    .map((story) => ({ number: story.number, missing: story.missing }));
}

/** The subjects the trail knows about at all. */
export function subjectsIn(trail) {
  return [...new Set(trail.entries.map((entry) => entry.subject))].sort();
}
