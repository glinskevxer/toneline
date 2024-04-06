/**
 * Ticket lifecycle.
 *
 * A ticket moves through a small set of states and only some moves are legal.
 * Keeping the map in one place means the CLI, the dispatcher and the importer
 * cannot each invent their own idea of what follows what.
 */

import { TicketError } from '../core/errors.js';
import { deepFreeze, optionalString, requireString } from '../core/fields.js';
import { compareStamps, isStamp } from '../time/stamp.js';
import { withTicketFields } from './record.js';
import { ticketStatus } from './types.js';

const TRANSITIONS = new Map([
  ['RECEIVED', ['SCREENED', 'CANCELLED', 'VOID']],
  ['SCREENED', ['ASSIGNED', 'RESPONDED', 'CANCELLED', 'VOID']],
  ['ASSIGNED', ['IN_PROGRESS', 'SCREENED', 'CANCELLED', 'VOID']],
  ['IN_PROGRESS', ['RESPONDED', 'ASSIGNED', 'CANCELLED', 'VOID']],
  ['RESPONDED', ['CLOSED', 'IN_PROGRESS', 'VOID']],
  ['CLOSED', ['IN_PROGRESS']],
  ['CANCELLED', []],
  ['VOID', []],
]);

/** The states a ticket in this state may move to. */
export function nextStates(status) {
  return [...(TRANSITIONS.get(ticketStatus(status)) ?? [])];
}

/** True when the move is one the desk allows. */
export function canTransition(from, to) {
  return nextStates(from).includes(ticketStatus(to));
}

/** True when nothing further can happen to a ticket in this state. */
export function isTerminal(status) {
  return nextStates(status).length === 0;
}

/**
 * Move a ticket to a new state, returning the new ticket and the event that
 * records the move.
 *
 * @param {object} ticket the ticket as it stands
 * @param {object} args
 * @param {string} args.to the state to move to
 * @param {string} args.at when the move happened
 * @param {string} args.by who made it
 * @param {string} [args.note] free text kept on the event
 */
export function transition(ticket, { to, at, by, note = null }) {
  const target = ticketStatus(to);
  if (!isStamp(at)) {
    throw new TicketError('a lifecycle move needs a timestamp', { at });
  }
  const actor = requireString(by, 'by');
  if (!canTransition(ticket.status, target)) {
    throw new TicketError('that lifecycle move is not one the desk allows', {
      number: ticket.number,
      from: ticket.status,
      to: target,
      allowed: nextStates(ticket.status),
    });
  }
  const event = deepFreeze({
    number: ticket.number,
    from: ticket.status,
    to: target,
    at,
    by: actor,
    note: optionalString(note, 'note'),
  });
  return { ticket: withTicketFields(ticket, { status: target }), event };
}

/** Replay a run of lifecycle events over a ticket, checking each move. */
export function replay(ticket, events) {
  let current = ticket;
  const applied = [];
  let last = null;
  for (const raw of events) {
    if (last !== null && compareStamps(raw.at, last) < 0) {
      throw new TicketError('lifecycle events are out of order', {
        number: ticket.number,
        at: raw.at,
        after: last,
      });
    }
    const result = transition(current, raw);
    current = result.ticket;
    applied.push(result.event);
    last = raw.at;
  }
  return { ticket: current, events: applied };
}

/** The states a ticket has to pass through to reach a target, or null. */
export function pathTo(from, to) {
  const start = ticketStatus(from);
  const target = ticketStatus(to);
  if (start === target) return [start];
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift();
    for (const next of nextStates(path[path.length - 1])) {
      if (seen.has(next)) continue;
      const extended = [...path, next];
      if (next === target) return extended;
      seen.add(next);
      queue.push(extended);
    }
  }
  return null;
}
