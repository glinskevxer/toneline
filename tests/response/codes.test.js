import { describe, expect, it } from 'vitest';
import {
  ResponseError,
  RESPONSE_CODES,
  RESPONSE_KEYS,
  responseCode,
  isResponseCode,
  clearsToDig,
  closesTicket,
  followUpCodes,
} from '../../src/response/codes.js';

describe('the code set', () => {
  it('lists every code and key', () => {
    expect(RESPONSE_CODES).toHaveLength(11);
    expect(RESPONSE_KEYS).toContain('MARKED');
    expect(RESPONSE_CODES[0]).toBe('1');
  });

  it('freezes the entries it hands out', () => {
    expect(Object.isFrozen(responseCode('2'))).toBe(true);
  });
});

describe('responseCode', () => {
  it('looks a code up by number', () => {
    expect(responseCode('2').key).toBe('MARKED');
    expect(responseCode('10').key).toBe('DELAYED');
  });

  it('looks a code up by key in any case or spacing', () => {
    expect(responseCode('marked').code).toBe('2');
    expect(responseCode('no facilities').code).toBe('1');
    expect(responseCode('part-marked').code).toBe('3');
  });

  it('rejects a code the centre does not accept', () => {
    try {
      responseCode('99');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResponseError);
      expect(err.details.known).toContain('1');
    }
  });

  it('rejects nothing at all', () => {
    expect(() => responseCode(null)).toThrow(/not one the centre accepts/);
  });

  it('answers membership without throwing', () => {
    expect(isResponseCode('7')).toBe(true);
    expect(isResponseCode('critical')).toBe(true);
    expect(isResponseCode('99')).toBe(false);
  });
});

describe('what a code means', () => {
  it('separates clearing to dig from closing the ticket', () => {
    expect(clearsToDig('2')).toBe(true);
    expect(closesTicket('2')).toBe(true);
    expect(clearsToDig('3')).toBe(false);
    expect(closesTicket('3')).toBe(false);
  });

  it('clears an abandoned only site', () => {
    expect(clearsToDig('8')).toBe(true);
    expect(responseCode('8').requiresMarks).toBe(false);
  });

  it('does not clear a critical facility until the meet', () => {
    expect(clearsToDig('7')).toBe(false);
    expect(responseCode('7').needsFollowUp).toBe(true);
  });

  it('clears a ticket that is not ours', () => {
    expect(clearsToDig('9')).toBe(true);
    expect(closesTicket('9')).toBe(true);
  });

  it('lists the codes that leave work behind', () => {
    expect(followUpCodes()).toEqual(['3', '4', '5', '6', '7', '10', '11']);
  });
});
