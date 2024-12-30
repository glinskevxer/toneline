/**
 * Relating tickets.
 *
 * A dig generates a family of transmissions: the original, updates that extend
 * it, a second notice when nobody answered, a cancellation, and sometimes a
 * damage notification pointing back at it. Reading them as one story is what
 * lets the desk answer "what happened here" instead of "what does this ticket
 * say".
 */

import { deepFreeze } from '../core/fields.js';
import { compareStamps } from '../time/stamp.js';
import { baseTicketNumber } from '../core/ids.js';
import { ticketType } from './types.js';

/** How one ticket relates to the one before it in the family. */
export const RELATIONS = Object.freeze([
  'original',
  'update',
  'second notice',
  'cancellation',
  'damage notification',
  'unrelated',
]);

/** Name the relation between a ticket and the family it joins. */
export function relationOf(ticket) {
  switch (ticketType(ticket.type).code) {
    case 'UPDATE':
      return 'update';
    case 'SECOND':
      return 'second notice';
    case 'CANCEL':
      return 'cancellation';
    case 'DAMAGE':
      return 'damage notification';
    default:
      return ticket.revision === 0 ? 'original' : 'update';
  }
}

/**
 * Gather the family a ticket belongs to.
 *
 * @param {object[]} tickets every ticket the desk holds
 * @param {string} number any member of the family
 * @returns {object} a frozen family record
 */
export function familyOf(tickets, number) {
  const base = baseTicketNumber(number);
  const members = tickets
    .filter((ticket) => ticket.base === base)
    .sort(
      (left, right) => compareStamps(left.takenAt, right.takenAt) || left.revision - right.revision
    );
  const relations = members.map((ticket) => ({
    number: ticket.number,
    relation: relationOf(ticket),
  }));
  const cancelled = relations.some((entry) => entry.relation === 'cancellation');
  return deepFreeze({
    base,
    members: members.map((ticket) => ticket.number),
    relations,
    original: members.length === 0 ? null : members[0].number,
    current: members.length === 0 ? null : members[members.length - 1].number,
    cancelled,
    updates: relations.filter((entry) => entry.relation === 'update').length,
    hasSecondNotice: relations.some((entry) => entry.relation === 'second notice'),
    hasDamage: relations.some((entry) => entry.relation === 'damage notification'),
  });
}

/** Group a set of tickets into families, in base number order. */
export function families(tickets) {
  const bases = [...new Set(tickets.map((ticket) => ticket.base))].sort();
  return bases.map((base) => familyOf(tickets, base));
}

/**
 * The ticket the desk should be working to.
 *
 * A cancellation ends the family however many updates follow it in the file,
 * because an excavator who called off a dig has called it off.
 */
export function workingTicket(tickets, number) {
  const base = baseTicketNumber(number);
  const members = tickets
    .filter((ticket) => ticket.base === base)
    .sort(
      (left, right) => compareStamps(left.takenAt, right.takenAt) || left.revision - right.revision
    );
  if (members.length === 0) return null;
  const cancelled = members.find((ticket) => relationOf(ticket) === 'cancellation');
  if (cancelled !== undefined) return cancelled;
  return members[members.length - 1];
}

/** True when the family has been called off. */
export function isCancelled(tickets, number) {
  const working = workingTicket(tickets, number);
  return working !== null && relationOf(working) === 'cancellation';
}

/** Families where a second notice arrived, which means the desk was late. */
export function withSecondNotice(tickets) {
  return families(tickets).filter((family) => family.hasSecondNotice);
}
