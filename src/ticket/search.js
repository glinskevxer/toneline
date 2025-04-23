/**
 * Finding a ticket.
 *
 * Somebody rings the desk with half a ticket number, or a street, or the name
 * of the contractor and roughly when. All three have to work, and none of them
 * should need the caller to know how the desk spells anything, so every text
 * match goes through the same normalising the rest of the library uses.
 */

import { normaliseCode } from '../core/fields.js';
import { normaliseStreet, placeKey } from '../text/address.js';
import { compareDates, daysBetween } from '../time/date.js';
import { dateOf } from '../time/stamp.js';

/** True when the ticket number contains the fragment. */
export function matchesNumber(ticket, fragment) {
  const wanted = normaliseCode(fragment);
  return wanted !== '' && ticket.number.includes(wanted);
}

/** True when the ticket is on the street named. */
export function matchesStreet(ticket, street) {
  const wanted = normaliseStreet(street);
  if (wanted === '') return false;
  const address = ticket.address === null ? '' : placeKey(ticket.address);
  const cross = ticket.intersection === null ? '' : normaliseStreet(ticket.intersection);
  return address.includes(wanted) || cross.includes(wanted);
}

/** True when the excavator name contains the fragment. */
export function matchesExcavator(ticket, name) {
  const wanted = normaliseStreet(name);
  if (wanted === '' || ticket.excavator === null) return false;
  return normaliseStreet(ticket.excavator.company).includes(wanted);
}

/** True when the ticket was taken inside the window, both ends included. */
export function takenBetween(ticket, from, to) {
  const day = dateOf(ticket.takenAt);
  return compareDates(day, from) >= 0 && compareDates(day, to) <= 0;
}

/**
 * Search a set of tickets.
 *
 * Every term given has to match. A search with no terms at all comes back
 * empty rather than returning the whole file, because a caller that meant to
 * pass a term and did not is asking a different question.
 *
 * @param {object[]} tickets
 * @param {object} terms
 * @returns {object[]} the matches, newest first
 */
export function search(tickets, terms = {}) {
  const { number, street, excavator, status, type, from, to } = terms;
  const given = [number, street, excavator, status, type, from].filter(
    (term) => term !== undefined && term !== null && String(term).trim() !== ''
  );
  if (given.length === 0) return [];

  return tickets
    .filter((ticket) => {
      if (number && !matchesNumber(ticket, number)) return false;
      if (street && !matchesStreet(ticket, street)) return false;
      if (excavator && !matchesExcavator(ticket, excavator)) return false;
      if (status && ticket.status !== normaliseCode(status, { separator: '_' })) return false;
      if (type && ticket.type !== normaliseCode(type)) return false;
      if (from && !takenBetween(ticket, from, to ?? from)) return false;
      return true;
    })
    .sort(
      (left, right) =>
        right.takenAt.localeCompare(left.takenAt) || left.number.localeCompare(right.number)
    );
}

/**
 * The one ticket a search found, or null when it found none or several.
 *
 * Used where the answer has to be unambiguous, such as a command that is about
 * to change something.
 */
export function findOne(tickets, terms) {
  const found = search(tickets, terms);
  return found.length === 1 ? found[0] : null;
}

/** Tickets near a date, ordered by how far away they are from it. */
export function around(tickets, date, days = 3) {
  return tickets
    .map((ticket) => ({ ticket, away: Math.abs(daysBetween(date, dateOf(ticket.takenAt))) }))
    .filter((entry) => entry.away <= days)
    .sort(
      (left, right) =>
        left.away - right.away || left.ticket.number.localeCompare(right.ticket.number)
    )
    .map((entry) => entry.ticket);
}
