/**
 * Policies.
 *
 * A dozen modules take a bag of settings, merge it over their own defaults and
 * check the numbers. They were each doing it slightly differently, which is how
 * one of them ended up accepting a negative it should not have. This is the one
 * way of doing it, and the modules keep their own defaults and their own rules.
 */

import { TonelineError } from '../core/errors.js';

/** Raised when a policy will not do. */
export class PolicyError extends TonelineError {
  constructor(message, details = {}) {
    super('POLICY_INVALID', message, details);
  }
}

/** A check that a value is a number at or above zero. */
export function atOrAboveZero(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new PolicyError('a policy value must be a number at or above zero', { key, value });
  }
}

/** A check that a value is a number above zero. */
export function aboveZero(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PolicyError('a policy value must be a number above zero', { key, value });
  }
}

/** A check that a value is a whole number of one or more. */
export function wholeFromOne(value, key) {
  if (!Number.isInteger(value) || value < 1) {
    throw new PolicyError('a policy value must be a whole number of one or more', { key, value });
  }
}

/** A check that a value is a whole number at or above zero. */
export function wholeFromZero(value, key) {
  if (!Number.isInteger(value) || value < 0) {
    throw new PolicyError('a policy value must be a whole number at or above zero', { key, value });
  }
}

/** A check that a value is a share between zero and one. */
export function share(value, key) {
  atOrAboveZero(value, key);
  if (value > 1) {
    throw new PolicyError('a policy share cannot be more than one', { key, value });
  }
}

/**
 * Define a policy.
 *
 * @param {object} defaults the settings and their standing values
 * @param {object} [checks] a check per key, run over the merged value
 * @param {object} [options]
 * @param {string[]} [options.nested] keys whose value is itself merged rather
 *   than replaced, which is how a partial override of a lookup table works
 * @returns {Function} the merge function the module exports
 */
export function definePolicy(defaults, checks = {}, options = {}) {
  const nested = options.nested ?? [];
  const standing = Object.freeze({ ...defaults });
  return function mergePolicy(overrides = {}) {
    if (overrides === null || typeof overrides !== 'object') {
      throw new PolicyError('a policy override must be an object', { type: typeof overrides });
    }
    const merged = { ...standing, ...overrides };
    for (const key of nested) {
      merged[key] = Object.freeze({ ...(standing[key] ?? {}), ...(overrides[key] ?? {}) });
    }
    for (const [key, check] of Object.entries(checks)) {
      check(merged[key], key);
    }
    return Object.freeze(merged);
  };
}

/** The keys a policy carries, which is what a configuration may set. */
export function policyKeys(defaults) {
  return Object.keys(defaults).sort();
}
