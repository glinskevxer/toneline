/**
 * Field coercion.
 *
 * Records arrive from CSV, from JSON and from a text transmission, so a value
 * that should be a number turns up as `"120"` about as often as `120`. These
 * helpers do the coercion once, in one place, and every failure names the field
 * so a bad extract points at its own column.
 */

import { TonelineError } from './errors.js';

/** Raised when a record field cannot be coerced to what it has to be. */
export class FieldError extends TonelineError {
  constructor(message, details = {}) {
    super('FIELD_INVALID', message, details);
  }
}

function fail(field, message, extra = {}) {
  throw new FieldError(`${field} ${message}`, { field, ...extra });
}

/** True when the value is absent for the purposes of a record. */
export function isBlank(value) {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

/** A trimmed string that has to be there. */
export function requireString(value, field) {
  if (isBlank(value)) fail(field, 'is required');
  if (typeof value !== 'string' && typeof value !== 'number') {
    fail(field, 'must be text', { type: typeof value });
  }
  return String(value).trim();
}

/** A trimmed string, or the fallback when it is absent. */
export function optionalString(value, field, fallback = null) {
  if (isBlank(value)) return fallback;
  return requireString(value, field);
}

/** A finite number that has to be there. */
export function requireNumber(value, field) {
  if (isBlank(value)) fail(field, 'is required');
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(number)) fail(field, 'must be a number', { value });
  return number;
}

/** A finite number, or the fallback when it is absent. */
export function optionalNumber(value, field, fallback = null) {
  if (isBlank(value)) return fallback;
  return requireNumber(value, field);
}

/** A number at or above zero. */
export function requireNonNegative(value, field) {
  const number = requireNumber(value, field);
  if (number < 0) fail(field, 'cannot be negative', { value: number });
  return number;
}

/** A whole number. */
export function requireInteger(value, field) {
  const number = requireNumber(value, field);
  if (!Number.isInteger(number)) fail(field, 'must be a whole number', { value: number });
  return number;
}

/** A yes or no value written any of the ways an extract writes one. */
export function requireBoolean(value, field) {
  if (typeof value === 'boolean') return value;
  if (isBlank(value)) fail(field, 'is required');
  const text = String(value).trim().toUpperCase();
  if (['Y', 'YES', 'TRUE', 'T', '1'].includes(text)) return true;
  if (['N', 'NO', 'FALSE', 'F', '0'].includes(text)) return false;
  fail(field, 'must be yes or no', { value });
  return false;
}

/** A yes or no value, or the fallback when it is absent. */
export function optionalBoolean(value, field, fallback = false) {
  if (isBlank(value)) return fallback;
  return requireBoolean(value, field);
}

/** One of a fixed set of codes, upper cased. */
export function requireEnum(value, field, allowed) {
  const text = requireString(value, field).toUpperCase();
  if (!allowed.includes(text)) {
    fail(field, 'is not one of the allowed values', { value: text, allowed });
  }
  return text;
}

/** An array that has to be there and has to hold something. */
export function requireArray(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) fail(field, 'must be a list', { type: typeof value });
  if (!allowEmpty && value.length === 0) fail(field, 'cannot be empty');
  return value;
}

/** An array, defaulting to empty, accepting a comma separated string as well. */
export function optionalList(value, field, fallback = []) {
  if (isBlank(value)) return fallback;
  if (Array.isArray(value)) return value.map((entry) => requireString(entry, field));
  return String(value)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * Reduce a value to the shape a lookup key is stored in.
 *
 * Every registry in the library is keyed by an upper case code, and every
 * caller has its own idea of how much whitespace and punctuation to leave on,
 * so the reduction lives here rather than being retyped at each lookup.
 */
export function normaliseCode(value, { separator = null } = {}) {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();
  return separator === null ? text : text.replace(/[\s-]+/g, separator);
}

/** Freeze an object and everything reachable from it. */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

/** Drop every key whose value is null or undefined. */
export function compact(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}
