/**
 * Taking a record that may already be one.
 *
 * Every store in the library accepts either a loose object to build from or a
 * record that has already been built, and each of them was deciding which it
 * had by looking for a field it happened to know about. That worked until a
 * loose object turned up carrying that field. This is the one way of asking.
 */

import { TonelineError } from './errors.js';

/** Raised when a value cannot be taken as a record at all. */
export class RecordError extends TonelineError {
  constructor(message, details = {}) {
    super('RECORD_INVALID', message, details);
  }
}

/**
 * True when the value has already been through its builder.
 *
 * A built record is frozen and carries every field the builder puts on it, so
 * both are checked: frozen alone would accept anything a caller had frozen, and
 * the fields alone would accept a loose object that happened to have them.
 *
 * @param {unknown} value
 * @param {string[]} fields the fields the builder always sets
 */
export function isBuilt(value, fields) {
  if (value === null || typeof value !== 'object' || !Object.isFrozen(value)) return false;
  return fields.every((field) => field in value);
}

/**
 * Take a value as a record, building it only when it is not one already.
 *
 * @param {unknown} value the loose object or the built record
 * @param {Function} build the builder for this kind of record
 * @param {string[]} fields the fields the builder always sets
 * @returns {object} the record
 */
export function asRecord(value, build, fields) {
  if (typeof build !== 'function') {
    throw new RecordError('a record needs a builder', { type: typeof build });
  }
  if (isBuilt(value, fields)) return value;
  return build(value);
}

/**
 * Take a list of values as records.
 *
 * @param {unknown[]} values
 * @param {Function} build
 * @param {string[]} fields
 */
export function asRecords(values, build, fields) {
  if (!Array.isArray(values)) {
    throw new RecordError('a list of records must be an array', { type: typeof values });
  }
  return values.map((value) => asRecord(value, build, fields));
}

/** The fields each kind of record is recognised by. */
export const MARKERS = Object.freeze({
  ticket: ['number', 'base', 'revision', 'type', 'takenAt', 'status'],
  facility: ['id', 'type', 'path', 'abandoned', 'toleranceFeet'],
  response: ['number', 'code', 'key', 'scope', 'at'],
  assignment: ['number', 'locatorId', 'at', 'by', 'types'],
  damage: ['id', 'at', 'facilityType', 'method', 'reportedBy'],
});
