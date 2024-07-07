/**
 * The ticket store.
 *
 * Tickets arrive more than once. An update, a second notice and a cancellation
 * all carry the same base number, and the desk has to be able to see the whole
 * history of a dig as well as the version it is currently working to. The store
 * keeps every version and answers both questions.
 */

import { TicketError } from '../core/errors.js';
import { normaliseCode } from '../core/fields.js';
import { compareStamps, dateOf } from '../time/stamp.js';
import { buildTicket, siteKey } from '../ticket/record.js';

/** An in memory store of tickets, keyed by base number. */
export class TicketStore {
  constructor(tickets = []) {
    this.versions = new Map();
    this.bySite = new Map();
    for (const ticket of tickets) this.put(ticket);
  }

  /** How many distinct excavations the store holds. */
  get size() {
    return this.versions.size;
  }

  /** How many transmissions the store holds across every excavation. */
  get versionCount() {
    let total = 0;
    for (const list of this.versions.values()) total += list.length;
    return total;
  }

  /** Add a ticket, building it first when handed a loose record. */
  put(raw) {
    const ticket = Object.isFrozen(raw) && raw.base ? raw : buildTicket(raw);
    const list = this.versions.get(ticket.base) ?? [];
    const existing = list.findIndex((held) => held.revision === ticket.revision);
    if (existing >= 0) list[existing] = ticket;
    else list.push(ticket);
    list.sort((left, right) => left.revision - right.revision);
    this.versions.set(ticket.base, list);
    const key = siteKey(ticket);
    const sameSite = this.bySite.get(key) ?? new Set();
    sameSite.add(ticket.base);
    this.bySite.set(key, sameSite);
    return ticket;
  }

  /** Add many at once. */
  putAll(records) {
    return records.map((record) => this.put(record));
  }

  /** Every version of one excavation, oldest revision first. */
  history(number) {
    const base = baseOf(number);
    return [...(this.versions.get(base) ?? [])];
  }

  /** The newest version of one excavation, or null. */
  latest(number) {
    const list = this.history(number);
    return list.length === 0 ? null : list[list.length - 1];
  }

  /** One exact version, or null. */
  get(number) {
    const wanted = normaliseCode(number);
    return this.history(wanted).find((ticket) => ticket.number === wanted) ?? null;
  }

  /** True when the store already holds that excavation. */
  has(number) {
    return this.versions.has(baseOf(number));
  }

  /** The newest version of every excavation, in base number order. */
  current() {
    return [...this.versions.keys()].sort().map((base) => this.latest(base));
  }

  /** Every current ticket in one status. */
  byStatus(status) {
    const wanted = normaliseCode(status, { separator: '_' });
    return this.current().filter((ticket) => ticket.status === wanted);
  }

  /** Every current ticket taken on one date. */
  takenOn(date) {
    return this.current().filter((ticket) => dateOf(ticket.takenAt) === date);
  }

  /** Every current ticket at the same place as the one given. */
  atSameSite(number) {
    const ticket = this.latest(number);
    if (ticket === null) {
      throw new TicketError('the store does not hold that ticket', { number });
    }
    const bases = this.bySite.get(siteKey(ticket)) ?? new Set();
    return [...bases]
      .filter((base) => base !== ticket.base)
      .sort()
      .map((base) => this.latest(base));
  }

  /** Current tickets ordered by when the call was taken, oldest first. */
  inTakenOrder() {
    return this.current().sort(
      (left, right) =>
        compareStamps(left.takenAt, right.takenAt) || left.base.localeCompare(right.base)
    );
  }

  /** A plain array of every version, suitable for writing out. */
  toJSON() {
    const out = [];
    for (const base of [...this.versions.keys()].sort()) {
      out.push(...this.versions.get(base));
    }
    return out;
  }
}

function baseOf(number) {
  const text = normaliseCode(number);
  const dash = text.indexOf('-');
  return dash === -1 ? text : text.slice(0, dash);
}
