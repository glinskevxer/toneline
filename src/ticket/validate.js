/**
 * Ticket quality.
 *
 * A ticket can be perfectly well formed and still be a poor ticket: no extent,
 * no white lining on a big dig, an excavator nobody can ring, a work area the
 * size of a county. None of that stops the desk answering it, so these are
 * warnings rather than errors, and they carry the ticket number so a weekly
 * report can be sent back to the centre.
 */

import { isReachable } from './record.js';
import { aboveZero, definePolicy, wholeFromOne } from '../config/policies.js';
import { extentFootage, workAreaFor, workAreaSquareFeet } from './site.js';
import { ticketType } from './types.js';

/** What counts as a big enough dig to expect white lining. */
export const DEFAULT_QUALITY_RULES = Object.freeze({
  whiteLineOverFeet: 300,
  hugeAreaSquareFeet: 500000,
  minExtentWords: 3,
});

/** Merge partial rules over the defaults. */
export const qualityRules = definePolicy(DEFAULT_QUALITY_RULES, {
  whiteLineOverFeet: aboveZero,
  hugeAreaSquareFeet: aboveZero,
  minExtentWords: wholeFromOne,
});

/**
 * Check one ticket.
 *
 * @param {object} ticket
 * @param {object} [options]
 * @param {object} [options.rules]
 * @param {object} [options.site] site policy for the work area
 * @returns {string[]} one line per warning
 */
export function checkTicket(ticket, options = {}) {
  const rules = options.rules ?? DEFAULT_QUALITY_RULES;
  const warnings = [];
  const definition = ticketType(ticket.type);
  const area = workAreaFor(ticket, { policy: options.site });

  if (area.ring === null && definition.requiresMarking) {
    warnings.push('no grid points, so the work area had to be guessed from the address');
  }
  if (ticket.extent === null) {
    warnings.push('no extent was given');
  } else if (ticket.extent.trim().split(/\s+/).length < rules.minExtentWords) {
    warnings.push('the extent is too short to place the dig');
  }
  const footage = extentFootage(ticket.extent);
  if (footage !== null && footage > rules.whiteLineOverFeet && !ticket.whiteLined) {
    warnings.push(`a dig of ${footage} feet was not white lined`);
  }
  if (ticket.excavator === null) {
    warnings.push('no excavator was named');
  } else if (!isReachable(ticket)) {
    warnings.push('the excavator cannot be reached from what the ticket carries');
  }
  if (ticket.members.length === 0) {
    warnings.push('the centre routed the ticket to nobody');
  }
  if (ticket.boring && ticket.depthFeet === null) {
    warnings.push('a bore was declared with no depth');
  }
  const square = area.ring === null ? null : workAreaSquareFeet(ticket, { policy: options.site });
  if (square !== null && square > rules.hugeAreaSquareFeet) {
    warnings.push('the work area is too large to mark in one visit');
  }
  return warnings;
}

/**
 * Check a run of tickets and keep only the ones with something to say.
 *
 * @returns {Array<{number: string, warnings: string[]}>}
 */
export function checkTickets(tickets, options = {}) {
  return tickets
    .map((ticket) => ({ number: ticket.number, warnings: checkTicket(ticket, options) }))
    .filter((entry) => entry.warnings.length > 0);
}

/** How often each warning came up, worst first. */
export function warningCounts(results) {
  const counts = new Map();
  for (const entry of results) {
    for (const warning of entry.warnings) {
      counts.set(warning, (counts.get(warning) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([warning, count]) => ({ warning, count }))
    .sort((left, right) => right.count - left.count || left.warning.localeCompare(right.warning));
}

/** The share of tickets with nothing wrong with them. */
export function cleanShare(tickets, options = {}) {
  if (tickets.length === 0) return 1;
  const bad = checkTickets(tickets, options).length;
  return (tickets.length - bad) / tickets.length;
}
