import { describe, expect, it } from 'vitest';
import {
  phoneDigits,
  phoneExtension,
  formatPhone,
  samePhone,
  isDiallable,
  isEmail,
  normaliseEmail,
  tidyContact,
} from '../../src/text/contact.js';

describe('phoneDigits and phoneExtension', () => {
  it('keeps the digits and drops the rest', () => {
    expect(phoneDigits('(405) 555-0148')).toBe('4055550148');
    expect(phoneDigits('405.555.0148')).toBe('4055550148');
  });

  it('takes the extension off before counting digits', () => {
    expect(phoneDigits('405-555-0148 x214')).toBe('4055550148');
    expect(phoneExtension('405-555-0148 x214')).toBe('214');
    expect(phoneExtension('405-555-0148 ext. 214')).toBe('214');
    expect(phoneExtension('405-555-0148')).toBeNull();
  });

  it('handles nothing at all', () => {
    expect(phoneDigits(null)).toBe('');
    expect(phoneExtension(undefined)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('prints ten digits one way', () => {
    expect(formatPhone('(405) 555-0148')).toBe('405 555 0148');
    expect(formatPhone('4055550148')).toBe('405 555 0148');
  });

  it('drops a leading country code', () => {
    expect(formatPhone('1-405-555-0148')).toBe('405 555 0148');
  });

  it('keeps the extension on the end', () => {
    expect(formatPhone('405-555-0148 x214')).toBe('405 555 0148 x214');
  });

  it('hands back anything it cannot shape rather than mangling it', () => {
    expect(formatPhone('555-0148')).toBe('555-0148');
    expect(formatPhone('   ')).toBe('');
  });
});

describe('samePhone and isDiallable', () => {
  it('matches the same telephone written differently', () => {
    expect(samePhone('(405) 555-0148', '1 405 555 0148')).toBe(true);
    expect(samePhone('405-555-0148', '405-555-0149')).toBe(false);
  });

  it('never matches on an empty number', () => {
    expect(samePhone('', '405-555-0148')).toBe(false);
    expect(samePhone(null, null)).toBe(false);
  });

  it('knows what can be dialled', () => {
    expect(isDiallable('405-555-0148')).toBe(true);
    expect(isDiallable('1-405-555-0148')).toBe(true);
    expect(isDiallable('555-0148')).toBe(false);
  });
});

describe('email helpers', () => {
  it('accepts the ordinary shapes', () => {
    expect(isEmail('rm@digwell.example')).toBe(true);
    expect(isEmail(' rm@digwell.co.uk ')).toBe(true);
  });

  it('rejects what is clearly not one', () => {
    expect(isEmail('rm@digwell')).toBe(false);
    expect(isEmail('digwell.example')).toBe(false);
    expect(isEmail('rm @digwell.example')).toBe(false);
    expect(isEmail(null)).toBe(false);
  });

  it('lower cases and trims', () => {
    expect(normaliseEmail('  RM@Digwell.Example ')).toBe('rm@digwell.example');
    expect(normaliseEmail(null)).toBe('');
  });
});

describe('tidyContact', () => {
  it('keeps a good block and finds no problems', () => {
    expect(
      tidyContact({ name: ' R Massey ', phone: '(405) 555-0148', email: 'RM@digwell.example' })
    ).toEqual({
      name: 'R Massey',
      phone: '405 555 0148',
      email: 'rm@digwell.example',
      problems: [],
    });
  });

  it('says what is missing', () => {
    const tidy = tidyContact({});
    expect(tidy.problems).toContain('no contact name was given');
    expect(tidy.problems).toContain('no phone number was given');
    expect(tidy.email).toBeNull();
  });

  it('says when the phone number will not dial', () => {
    expect(tidyContact({ name: 'x', phone: '555-0148' }).problems).toContain(
      'the phone number does not have enough digits to dial'
    );
  });

  it('says when the email is the wrong shape', () => {
    const tidy = tidyContact({ name: 'x', phone: '4055550148', email: 'rm@digwell' });
    expect(tidy.problems).toContain('the email address is not the right shape');
    expect(tidy.email).toBeNull();
  });

  it('leaves out an email that was never given', () => {
    expect(tidyContact({ name: 'x', phone: '4055550148' }).problems).toEqual([]);
  });

  it('copes with nothing at all', () => {
    expect(tidyContact(null).problems).toHaveLength(2);
  });
});
