/**
 * The audit trail.
 *
 * Damage prevention is a regulated activity and the operator has to be able to
 * show, months later, what it knew and when. Every stage of the desk appends
 * here, and nothing ever edits an entry once it is written.
 */

import { TonelineError } from '../core/errors.js';
import { deepFreeze, optionalString, requireString } from '../core/fields.js';
import { compareStamps, isStamp } from '../time/stamp.js';

/** Raised when a trail entry cannot be written. */
export class AuditError extends TonelineError {
  constructor(message, details = {}) {
    super('AUDIT_INVALID', message, details);
  }
}

/** Build one trail entry. */
export function auditEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AuditError('a trail entry must be built from an object', { type: typeof raw });
  }
  const at = requireString(raw.at, 'at');
  if (!isStamp(at)) {
    throw new AuditError('a trail entry needs a timestamp', { at });
  }
  return deepFreeze({
    at,
    subject: requireString(raw.subject, 'subject').toUpperCase(),
    action: requireString(raw.action, 'action').toLowerCase(),
    by: requireString(raw.by, 'by'),
    detail: optionalString(raw.detail, 'detail'),
    data: raw.data === undefined ? null : deepFreeze({ ...raw.data }),
  });
}

/** An append only run of trail entries. */
export class AuditTrail {
  constructor(entries = []) {
    this.entries = entries.map(auditEntry);
  }

  /** How many entries the trail holds. */
  get size() {
    return this.entries.length;
  }

  /** Append one entry and hand it back. */
  append(raw) {
    const entry = auditEntry(raw);
    this.entries.push(entry);
    return entry;
  }

  /** Append several at once. */
  appendAll(records) {
    return records.map((record) => this.append(record));
  }

  /** Every entry about one subject, oldest first. */
  forSubject(subject) {
    const wanted = String(subject ?? '').toUpperCase();
    return this.sorted().filter((entry) => entry.subject === wanted);
  }

  /** Every entry with one action. */
  forAction(action) {
    const wanted = String(action ?? '').toLowerCase();
    return this.sorted().filter((entry) => entry.action === wanted);
  }

  /** Every entry inside a time window, both ends included. */
  between(from, to) {
    return this.sorted().filter(
      (entry) => compareStamps(entry.at, from) >= 0 && compareStamps(entry.at, to) <= 0
    );
  }

  /** The whole trail in time order, with insertion order breaking a tie. */
  sorted() {
    return this.entries
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) => compareStamps(left.entry.at, right.entry.at) || left.index - right.index
      )
      .map((wrapped) => wrapped.entry);
  }

  /** The last entry about a subject, or null. */
  latestFor(subject) {
    const found = this.forSubject(subject);
    return found.length === 0 ? null : found[found.length - 1];
  }

  /** A plain array suitable for writing out as JSON. */
  toJSON() {
    return this.sorted();
  }
}

/** Render a trail entry as one line of text. */
export function formatEntry(entry) {
  const detail = entry.detail === null ? '' : ` ${entry.detail}`;
  return `${entry.at} ${entry.subject} ${entry.action} by ${entry.by}${detail}`;
}
