/**
 * The desk book.
 *
 * One object holding everything the desk knows, so a command does not have to
 * carry five collections around and keep them in step. The book owns the
 * stores; it does not own the desk, which is configuration and is loaded
 * separately, because the configuration changes at a different pace.
 */

import { TonelineError } from '../core/errors.js';
import { AuditTrail } from '../audit/trail.js';
import { MARKERS, asRecord } from '../core/records.js';
import { buildAssignment } from '../dispatch/assign.js';
import { buildDamage } from '../damage/report.js';
import { TicketStore } from './tickets.js';
import { ResponseStore } from './responses.js';
import { emptyJournal, journalCounts, readJournal, writeJournal } from './journal.js';

/** Raised when the book is asked for something it does not hold. */
export class BookError extends TonelineError {
  constructor(message, details = {}) {
    super('BOOK_INVALID', message, details);
  }
}

/** Everything the desk knows, in one place. */
export class DeskBook {
  constructor(journal = emptyJournal()) {
    const read = readJournal(journal);
    this.tickets = new TicketStore(read.tickets);
    this.responses = new ResponseStore(read.responses);
    this.assignments = read.assignments.map((assignment) => assignment);
    this.damages = read.damages.map((damage) => damage);
    this.trail = new AuditTrail(read.audit);
  }

  /** Add a ticket. */
  addTicket(raw) {
    return this.tickets.put(raw);
  }

  /** Add a posting. */
  addResponse(raw) {
    return this.responses.put(raw);
  }

  /** Add an assignment. */
  addAssignment(raw) {
    const assignment = asRecord(raw, buildAssignment, MARKERS.assignment);
    this.assignments.push(assignment);
    return assignment;
  }

  /** Add a damage report. */
  addDamage(raw) {
    const damage = asRecord(raw, buildDamage, MARKERS.damage);
    this.damages.push(damage);
    return damage;
  }

  /** Write one line on the audit trail. */
  note(entry) {
    return this.trail.append(entry);
  }

  /** Everything the book knows about one ticket. */
  fileFor(number) {
    const ticket = this.tickets.latest(number);
    if (ticket === null) {
      throw new BookError('the book does not hold that ticket', { number });
    }
    return {
      ticket,
      history: this.tickets.history(number),
      responses: this.responses.forTicket(ticket.number),
      standing: this.responses.standingFor(ticket.number),
      assignments: this.assignments.filter((assignment) => assignment.number === ticket.number),
      damages: this.damages.filter((damage) => damage.ticketNumber === ticket.number),
      trail: this.trail.forSubject(ticket.number),
    };
  }

  /** True when the book has a ticket by that number. */
  has(number) {
    return this.tickets.has(number);
  }

  /** How much of everything the book holds. */
  counts() {
    return {
      excavations: this.tickets.size,
      transmissions: this.tickets.versionCount,
      responses: this.responses.size,
      assignments: this.assignments.length,
      damages: this.damages.length,
      audit: this.trail.size,
    };
  }

  /** The book as a journal, ready to write out. */
  toJournal() {
    return writeJournal({
      tickets: this.tickets.toJSON(),
      responses: this.responses.toJSON(),
      assignments: this.assignments,
      damages: this.damages,
      audit: this.trail.toJSON(),
    });
  }
}

/** Open a book from a journal read off disk. */
export function openBook(journal) {
  return new DeskBook(journal ?? emptyJournal());
}

/** How many records a journal holds, without opening a book on it. */
export function peekJournal(journal) {
  return journalCounts(readJournal(journal));
}
