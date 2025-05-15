import { describe, expect, it } from 'vitest';
import {
  PolicyError,
  atOrAboveZero,
  aboveZero,
  wholeFromOne,
  wholeFromZero,
  share,
  definePolicy,
  policyKeys,
} from '../../src/config/policies.js';

describe('the checks', () => {
  it('accepts and rejects around zero', () => {
    expect(() => atOrAboveZero(0, 'x')).not.toThrow();
    expect(() => atOrAboveZero(-1, 'x')).toThrow(PolicyError);
    expect(() => aboveZero(0, 'x')).toThrow(/above zero/);
    expect(() => aboveZero(0.5, 'x')).not.toThrow();
  });

  it('rejects anything that is not a finite number', () => {
    expect(() => atOrAboveZero('five', 'x')).toThrow(PolicyError);
    expect(() => atOrAboveZero(Number.POSITIVE_INFINITY, 'x')).toThrow(PolicyError);
  });

  it('checks whole numbers', () => {
    expect(() => wholeFromOne(1, 'x')).not.toThrow();
    expect(() => wholeFromOne(0, 'x')).toThrow(/one or more/);
    expect(() => wholeFromOne(1.5, 'x')).toThrow(PolicyError);
    expect(() => wholeFromZero(0, 'x')).not.toThrow();
    expect(() => wholeFromZero(-1, 'x')).toThrow(/at or above zero/);
  });

  it('checks a share', () => {
    expect(() => share(0.5, 'x')).not.toThrow();
    expect(() => share(1, 'x')).not.toThrow();
    expect(() => share(1.5, 'x')).toThrow(/more than one/);
    expect(() => share(-0.5, 'x')).toThrow(PolicyError);
  });

  it('names the key it failed on', () => {
    try {
      atOrAboveZero(-1, 'graceMinutes');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details).toEqual({ key: 'graceMinutes', value: -1 });
    }
  });
});

describe('definePolicy', () => {
  const defaults = { days: 21, rate: 0.5, table: { A: 1, B: 2 } };
  const merge = definePolicy(defaults, { days: wholeFromOne, rate: share }, { nested: ['table'] });

  it('returns the defaults when nothing is overridden', () => {
    expect(merge()).toEqual(defaults);
    expect(Object.isFrozen(merge())).toBe(true);
  });

  it('merges an override without losing the rest', () => {
    expect(merge({ days: 14 })).toEqual({ ...defaults, days: 14 });
  });

  it('merges a nested table rather than replacing it', () => {
    expect(merge({ table: { B: 9 } }).table).toEqual({ A: 1, B: 9 });
  });

  it('freezes the nested table too', () => {
    expect(Object.isFrozen(merge().table)).toBe(true);
  });

  it('runs the checks over the merged value', () => {
    expect(() => merge({ days: 0 })).toThrow(/one or more/);
    expect(() => merge({ rate: 2 })).toThrow(/more than one/);
  });

  it('leaves a key with no check alone', () => {
    expect(merge({ table: { C: 3 } }).table.C).toBe(3);
  });

  it('rejects an override that is not an object', () => {
    expect(() => merge('fast')).toThrow(/must be an object/);
    expect(() => merge(null)).toThrow(PolicyError);
  });

  it('does not let one merge change the next', () => {
    merge({ days: 1 });
    expect(merge().days).toBe(21);
  });
});

describe('policyKeys', () => {
  it('lists what a configuration may set', () => {
    expect(policyKeys({ b: 1, a: 2 })).toEqual(['a', 'b']);
  });
});
