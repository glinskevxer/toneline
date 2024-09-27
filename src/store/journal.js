/**
 * The desk journal.
 *
 * Everything the desk has done, in one file that can be read back tomorrow.
 * The journal is versioned, because a file written by an older build has to
 * either load or say plainly that it cannot, and it is never partially applied:
 * a record that will not build stops the whole load.
 */

import { TonelineError } from '../core/errors.js';
import { deepFreeze } from '../core/fields.js';
import { buildTicket } from '../ticket/record.js';
import { buildResponse } from '../response/post.js';
import { buildAssignment } from '../dispatch/assign.js';
import { buildDamage } from '../damage/report.js';
import { auditEntry } from '../audit/trail.js';

/** The shape version this build writes and can read. */
export const JOURNAL_VERSION = 1;

/** Raised when a journal cannot be read or written. */
export class JournalError extends TonelineError {
  constructor(message, details = {}) {
    super('JOURNAL_INVALID', message, details);
  }
}

const SECTIONS = [
  { key: 'tickets', build: buildTicket },
  { key: 'responses', build: buildResponse },
  { key: 'assignments', build: buildAssignment },
  { key: 'damages', build: buildDamage },
  { key: 'audit', build: auditEntry },
];

/** An empty journal. */
export function emptyJournal() {
  return {
    version: JOURNAL_VERSION,
    tickets: [],
    responses: [],
    assignments: [],
    damages: [],
    audit: [],
  };
}

/**
 * Read a journal out of a plain object, building every record.
 *
 * @param {object} raw the parsed file
 * @returns {object} a frozen journal
 */
export function readJournal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new JournalError('a journal must be an object', { type: typeof raw });
  }
  if (raw.version !== JOURNAL_VERSION) {
    throw new JournalError('the journal was written by a different build', {
      found: raw.version ?? null,
      expected: JOURNAL_VERSION,
    });
  }
  const journal = { version: JOURNAL_VERSION };
  for (const section of SECTIONS) {
    const rows = raw[section.key] ?? [];
    if (!Array.isArray(rows)) {
      throw new JournalError('a journal section must be a list', { section: section.key });
    }
    journal[section.key] = rows.map((row, index) => {
      try {
        return section.build(row);
      } catch (err) {
        throw new JournalError('a journal record could not be read', {
          section: section.key,
          row: index + 1,
          reason: err.message,
        });
      }
    });
  }
  return deepFreeze(journal);
}

/** Render a journal as the plain object that goes to disk. */
export function writeJournal(journal) {
  const out = { version: JOURNAL_VERSION };
  for (const section of SECTIONS) {
    out[section.key] = (journal[section.key] ?? []).map((record) => ({ ...record }));
  }
  return out;
}

/** Add records to a journal, returning a new one rather than editing it. */
export function appendToJournal(journal, additions) {
  const next = { version: JOURNAL_VERSION };
  for (const section of SECTIONS) {
    next[section.key] = [...(journal[section.key] ?? []), ...(additions[section.key] ?? [])];
  }
  return readJournal(writeJournal(next));
}

/** How many records the journal holds in each section. */
export function journalCounts(journal) {
  const counts = {};
  for (const section of SECTIONS) {
    counts[section.key] = (journal[section.key] ?? []).length;
  }
  return counts;
}

/** Everything in the journal about one ticket. */
export function journalForTicket(journal, number) {
  const wanted = String(number ?? '').toUpperCase();
  return {
    tickets: journal.tickets.filter((ticket) => ticket.number === wanted),
    responses: journal.responses.filter((response) => response.number === wanted),
    assignments: journal.assignments.filter((assignment) => assignment.number === wanted),
    damages: journal.damages.filter((damage) => damage.ticketNumber === wanted),
    audit: journal.audit.filter((entry) => entry.subject === wanted),
  };
}
