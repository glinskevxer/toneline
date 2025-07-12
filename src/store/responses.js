/**
 * The posting store.
 *
 * Postings are read far more often than they are written, and always by ticket
 * or by day, so the store keeps both indexes rather than filtering a flat list
 * every time. Superseded postings stay in the store: the standing answer is a
 * question you ask it, not a thing it throws away.
 */

import { normaliseCode } from '../core/fields.js';
import { MARKERS, asRecord } from '../core/records.js';
import { compareStamps, dateOf } from '../time/stamp.js';
import { buildResponse, sortResponses } from '../response/post.js';
import { effectiveResponses, standingAnswer } from '../response/amend.js';

/** An indexed store of postings. */
export class ResponseStore {
  constructor(responses = []) {
    this.byTicket = new Map();
    this.byDay = new Map();
    this.count = 0;
    for (const response of responses) this.put(response);
  }

  /** How many postings the store holds. */
  get size() {
    return this.count;
  }

  /** Add a posting, building it first when handed a loose record. */
  put(raw) {
    const response = asRecord(raw, buildResponse, MARKERS.response);
    const ticket = this.byTicket.get(response.number) ?? [];
    ticket.push(response);
    this.byTicket.set(response.number, ticket);
    const day = dateOf(response.at);
    const daily = this.byDay.get(day) ?? [];
    daily.push(response);
    this.byDay.set(day, daily);
    this.count += 1;
    return response;
  }

  /** Add many at once. */
  putAll(records) {
    return records.map((record) => this.put(record));
  }

  /** Every posting against one ticket, oldest first. */
  forTicket(number) {
    return sortResponses(this.byTicket.get(normaliseCode(number)) ?? []);
  }

  /** Every posting made on one day, oldest first. */
  onDay(date) {
    return sortResponses(this.byDay.get(date) ?? []);
  }

  /** The postings against one ticket that have not been replaced. */
  standingFor(number) {
    return effectiveResponses(this.forTicket(number));
  }

  /** The latest standing answer for a ticket, or one facility type on it. */
  answerFor(number, scope = null) {
    return standingAnswer(this.forTicket(number), { number: normaliseCode(number), scope });
  }

  /** True when anything has been posted against the ticket. */
  hasAnswered(number) {
    return this.forTicket(number).length > 0;
  }

  /** Every ticket the store holds postings for. */
  tickets() {
    return [...this.byTicket.keys()].sort();
  }

  /** The days the store holds postings for. */
  days() {
    return [...this.byDay.keys()].sort();
  }

  /** Everything in the store, oldest first. */
  all() {
    const out = [];
    for (const list of this.byTicket.values()) out.push(...list);
    return out.sort(
      (left, right) => compareStamps(left.at, right.at) || left.number.localeCompare(right.number)
    );
  }

  /** How many postings carried each response code. */
  codeCounts() {
    const counts = {};
    for (const response of this.all()) {
      counts[response.code] = (counts[response.code] ?? 0) + 1;
    }
    return counts;
  }

  /** A plain array suitable for writing out. */
  toJSON() {
    return this.all();
  }
}

/** Build a store straight from loose records. */
export function buildResponseStore(records) {
  return new ResponseStore(records ?? []);
}
