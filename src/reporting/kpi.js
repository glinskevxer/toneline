/**
 * Desk indicators.
 *
 * The five numbers a locate manager is actually judged on, worked out from the
 * same records everything else reads so nothing can drift apart. Rates come
 * back as fractions rather than percentages, because a formatter is free to
 * choose and a stored percentage is a rounding error waiting to happen.
 */

import { deepFreeze } from '../core/fields.js';
import { dateOf, minutesBetween } from '../time/stamp.js';
import { complianceSummary } from '../response/compliance.js';
import { damageRate } from '../damage/stats.js';
import { ticketType } from '../ticket/types.js';

/** Average of a list of numbers, zero for an empty list. */
export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The value at a percentile of a sorted copy of the list. */
export function percentile(values, fraction) {
  if (values.length === 0) return 0;
  if (fraction <= 0) return Math.min(...values);
  if (fraction >= 1) return Math.max(...values);
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

/** Minutes from receiving a ticket to first answering it, per ticket. */
export function turnaroundMinutes(tickets, compliance) {
  const byNumber = new Map(compliance.map((record) => [record.number, record]));
  const spans = [];
  for (const ticket of tickets) {
    const record = byNumber.get(ticket.number);
    if (!record || record.firstPostedAt === null) continue;
    spans.push(minutesBetween(ticket.receivedAt, record.firstPostedAt));
  }
  return spans;
}

/**
 * Work the indicators out for a period.
 *
 * @param {object} args
 * @param {string} args.period a label for the period being measured
 * @param {object[]} args.tickets the tickets received in it
 * @param {object[]} args.compliance evaluations of those tickets
 * @param {object[]} [args.damages] damages that happened in it
 */
export function deskIndicators({ period, tickets, compliance, damages = [] }) {
  const summary = complianceSummary(compliance);
  const spans = turnaroundMinutes(tickets, compliance);
  const emergencies = tickets.filter((ticket) => ticketType(ticket.type).rank === 0);
  return deepFreeze({
    period,
    tickets: tickets.length,
    emergencies: emergencies.length,
    answered: summary.answered,
    onTimeRate: summary.onTimeRate,
    completionRate: tickets.length === 0 ? 0 : summary.complete / tickets.length,
    meanTurnaroundMinutes: Math.round(mean(spans)),
    p90TurnaroundMinutes: Math.round(percentile(spans, 0.9)),
    worstMinutesLate: summary.worstMinutesLate,
    damages: damages.length,
    damageRatePerThousand: damageRate(damages.length, tickets.length),
  });
}

/** Split a set of tickets into the days they were received on. */
export function ticketsByDay(tickets) {
  const days = new Map();
  for (const ticket of tickets) {
    const day = dateOf(ticket.receivedAt);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return [...days.keys()].sort().map((day) => ({ day, tickets: days.get(day) }));
}

/** The busiest day in a set, or null when there are none. */
export function busiestDay(tickets) {
  const days = ticketsByDay(tickets);
  if (days.length === 0) return null;
  return days.reduce((worst, day) => (day.tickets > worst.tickets ? day : worst), days[0]);
}

/** Compare two periods of indicators on the numbers a board asks about. */
export function compareIndicators(before, after) {
  return deepFreeze({
    tickets: after.tickets - before.tickets,
    onTimeRate: after.onTimeRate - before.onTimeRate,
    meanTurnaroundMinutes: after.meanTurnaroundMinutes - before.meanTurnaroundMinutes,
    damageRatePerThousand: after.damageRatePerThousand - before.damageRatePerThousand,
  });
}
