import { describe, expect, it } from 'vitest';
import {
  TonelineError,
  ConfigError,
  FeedParseError,
  TicketError,
  ScheduleError,
  isTonelineError,
  asTonelineError,
} from '../../src/core/errors.js';

describe('TonelineError', () => {
  it('keeps the code and the details it was given', () => {
    const err = new TonelineError('SOMETHING', 'it broke', { where: 'here' });
    expect(err.code).toBe('SOMETHING');
    expect(err.message).toBe('it broke');
    expect(err.details).toEqual({ where: 'here' });
  });

  it('names itself after the concrete subclass', () => {
    expect(new ConfigError('bad').name).toBe('ConfigError');
    expect(new TicketError('bad').name).toBe('TicketError');
  });

  it('serialises to a plain object', () => {
    const err = new FeedParseError('unreadable', { line: 4 });
    expect(err.toJSON()).toEqual({
      name: 'FeedParseError',
      code: 'FEED_UNREADABLE',
      message: 'unreadable',
      details: { line: 4 },
    });
  });

  it('defaults details to an empty bag', () => {
    expect(new ScheduleError('no clock').details).toEqual({});
  });
});

describe('isTonelineError', () => {
  it('accepts our own errors', () => {
    expect(isTonelineError(new ConfigError('x'))).toBe(true);
  });

  it('rejects native errors and other values', () => {
    expect(isTonelineError(new Error('x'))).toBe(false);
    expect(isTonelineError('x')).toBe(false);
    expect(isTonelineError(null)).toBe(false);
  });
});

describe('asTonelineError', () => {
  it('passes our own errors through untouched', () => {
    const original = new TicketError('nope');
    expect(asTonelineError(original)).toBe(original);
  });

  it('wraps a native error and keeps its message', () => {
    const wrapped = asTonelineError(new TypeError('not a function'));
    expect(wrapped.code).toBe('INTERNAL');
    expect(wrapped.message).toBe('not a function');
    expect(wrapped.details).toEqual({ cause: 'TypeError' });
  });

  it('wraps a thrown non error', () => {
    const wrapped = asTonelineError('boom', 'fallback');
    expect(wrapped.code).toBe('INTERNAL');
    expect(wrapped.message).toBe('fallback');
    expect(wrapped.details).toEqual({ thrown: 'boom' });
  });

  it('uses the fallback message when a native error carries none', () => {
    expect(asTonelineError(new Error(''), 'nothing said').message).toBe('nothing said');
  });
});
