import { describe, expect, it } from 'vitest';
import {
  FieldError,
  isBlank,
  requireString,
  optionalString,
  requireNumber,
  optionalNumber,
  requireNonNegative,
  requireInteger,
  requireBoolean,
  optionalBoolean,
  requireEnum,
  requireArray,
  optionalList,
  deepFreeze,
  compact,
  normaliseCode,
} from '../../src/core/fields.js';

describe('isBlank', () => {
  it('treats empty strings and nothing as blank', () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
  });
});

describe('strings', () => {
  it('trims a required string', () => {
    expect(requireString('  hello ', 'note')).toBe('hello');
  });

  it('accepts a number as text', () => {
    expect(requireString(120, 'footage')).toBe('120');
  });

  it('names the field it failed on', () => {
    try {
      requireString('', 'address');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FieldError);
      expect(err.message).toBe('address is required');
      expect(err.details.field).toBe('address');
    }
  });

  it('rejects a value that is not text at all', () => {
    expect(() => requireString({}, 'address')).toThrow(/must be text/);
  });

  it('falls back for an optional string', () => {
    expect(optionalString('', 'note')).toBeNull();
    expect(optionalString(null, 'note', 'none')).toBe('none');
    expect(optionalString(' x ', 'note')).toBe('x');
  });
});

describe('numbers', () => {
  it('reads a number from text with separators', () => {
    expect(requireNumber('1,240', 'footage')).toBe(1240);
    expect(requireNumber(12.5, 'footage')).toBe(12.5);
  });

  it('rejects text that is not a number', () => {
    expect(() => requireNumber('twelve', 'footage')).toThrow(/must be a number/);
    expect(() => requireNumber('', 'footage')).toThrow(/is required/);
  });

  it('falls back for an optional number', () => {
    expect(optionalNumber('', 'footage')).toBeNull();
    expect(optionalNumber(null, 'footage', 0)).toBe(0);
  });

  it('refuses a negative where none is allowed', () => {
    expect(requireNonNegative('0', 'footage')).toBe(0);
    expect(() => requireNonNegative(-1, 'footage')).toThrow(/cannot be negative/);
  });

  it('demands a whole number', () => {
    expect(requireInteger('12', 'count')).toBe(12);
    expect(() => requireInteger('12.5', 'count')).toThrow(/whole number/);
  });
});

describe('booleans', () => {
  it('reads the spellings an extract uses', () => {
    for (const yes of [true, 'Y', 'yes', 'TRUE', 't', 1]) {
      expect(requireBoolean(yes, 'boring')).toBe(true);
    }
    for (const no of [false, 'N', 'no', 'FALSE', 'f', 0]) {
      expect(requireBoolean(no, 'boring')).toBe(false);
    }
  });

  it('rejects anything else', () => {
    expect(() => requireBoolean('maybe', 'boring')).toThrow(/must be yes or no/);
    expect(() => requireBoolean('', 'boring')).toThrow(/is required/);
  });

  it('falls back for an optional flag', () => {
    expect(optionalBoolean('', 'boring')).toBe(false);
    expect(optionalBoolean(null, 'boring', true)).toBe(true);
    expect(optionalBoolean('y', 'boring')).toBe(true);
  });
});

describe('enumerations and lists', () => {
  it('upper cases and checks membership', () => {
    expect(requireEnum('gas', 'facility', ['GAS', 'ELECTRIC'])).toBe('GAS');
    expect(() => requireEnum('air', 'facility', ['GAS'])).toThrow(/not one of the allowed/);
  });

  it('demands an array', () => {
    expect(requireArray([], 'members')).toEqual([]);
    expect(() => requireArray('a', 'members')).toThrow(/must be a list/);
    expect(() => requireArray([], 'members', { allowEmpty: false })).toThrow(/cannot be empty/);
  });

  it('reads a list from an array or a separated string', () => {
    expect(optionalList(['a', ' b '], 'members')).toEqual(['a', 'b']);
    expect(optionalList('a, b; c', 'members')).toEqual(['a', 'b', 'c']);
    expect(optionalList('', 'members')).toEqual([]);
    expect(optionalList(null, 'members', ['x'])).toEqual(['x']);
  });
});

describe('object helpers', () => {
  it('freezes everything reachable', () => {
    const record = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.a.b)).toBe(true);
    expect(Object.isFrozen(record.a.b[1])).toBe(true);
  });

  it('leaves anything that is not an object alone', () => {
    expect(deepFreeze(4)).toBe(4);
    expect(deepFreeze(null)).toBeNull();
  });

  it('drops empty keys', () => {
    expect(compact({ a: 1, b: null, c: undefined, d: 0, e: '' })).toEqual({ a: 1, d: 0, e: '' });
  });
});

describe('normaliseCode', () => {
  it('trims and upper cases', () => {
    expect(normaliseCode('  gas ')).toBe('GAS');
  });

  it('reads nothing as an empty key', () => {
    expect(normaliseCode(null)).toBe('');
    expect(normaliseCode(undefined)).toBe('');
  });

  it('collapses spacing onto a separator when asked', () => {
    expect(normaliseCode('in progress', { separator: '_' })).toBe('IN_PROGRESS');
    expect(normaliseCode('part-marked', { separator: '_' })).toBe('PART_MARKED');
    expect(normaliseCode('no  facilities', { separator: '_' })).toBe('NO_FACILITIES');
  });

  it('leaves the spacing alone by default', () => {
    expect(normaliseCode('in progress')).toBe('IN PROGRESS');
  });
});
