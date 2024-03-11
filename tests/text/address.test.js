import { describe, expect, it } from 'vitest';
import {
  squash,
  tokenise,
  directional,
  streetSuffix,
  normaliseStreet,
  sameStreet,
  houseNumber,
  streetOf,
  placeKey,
} from '../../src/text/address.js';

describe('squash', () => {
  it('strips punctuation and collapses space', () => {
    expect(squash('  N.W.  23rd   St. ')).toBe('NW 23RD ST');
  });

  it('handles nothing at all', () => {
    expect(squash(null)).toBe('');
    expect(squash(undefined)).toBe('');
    expect(squash('   ')).toBe('');
  });

  it('drops a hash from a unit number', () => {
    expect(squash('APT #4')).toBe('APT 4');
  });
});

describe('tokenise', () => {
  it('splits on space', () => {
    expect(tokenise('N.W. 23rd St')).toEqual(['NW', '23RD', 'ST']);
  });

  it('returns nothing for empty text', () => {
    expect(tokenise('')).toEqual([]);
    expect(tokenise(null)).toEqual([]);
  });
});

describe('lookup helpers', () => {
  it('expands directionals', () => {
    expect(directional('nw')).toBe('NW');
    expect(directional('NORTHWEST')).toBe('NW');
    expect(directional('middle')).toBeNull();
    expect(directional(null)).toBeNull();
  });

  it('expands street suffixes', () => {
    expect(streetSuffix('street')).toBe('ST');
    expect(streetSuffix('BLVD')).toBe('BLVD');
    expect(streetSuffix('alley')).toBeNull();
  });
});

describe('normaliseStreet', () => {
  it('brings three spellings together', () => {
    const canonical = 'NW 23 ST';
    expect(normaliseStreet('N.W. 23RD ST')).toBe(canonical);
    expect(normaliseStreet('NW 23rd Street')).toBe(canonical);
    expect(normaliseStreet('northwest 23 st')).toBe(canonical);
  });

  it('leaves a named street alone apart from case', () => {
    expect(normaliseStreet('Robinson Avenue')).toBe('ROBINSON AVE');
  });

  it('keeps a word that only looks like an ordinal', () => {
    expect(normaliseStreet('Broadway')).toBe('BROADWAY');
  });

  it('handles empty text', () => {
    expect(normaliseStreet('')).toBe('');
  });
});

describe('sameStreet', () => {
  it('matches across spellings', () => {
    expect(sameStreet('N.W. 23RD ST', 'northwest 23 street')).toBe(true);
  });

  it('separates different streets', () => {
    expect(sameStreet('NW 23rd St', 'NW 24th St')).toBe(false);
    expect(sameStreet('NW 23rd St', 'SW 23rd St')).toBe(false);
  });

  it('never matches on empty text', () => {
    expect(sameStreet('', '')).toBe(false);
  });
});

describe('address parts', () => {
  it('reads a house number', () => {
    expect(houseNumber('1420 NW 23rd St')).toBe(1420);
    expect(houseNumber('NW 23rd St')).toBeNull();
    expect(houseNumber('')).toBeNull();
  });

  it('drops the house number from the street', () => {
    expect(streetOf('1420 N.W. 23RD ST')).toBe('NW 23 ST');
    expect(streetOf('NW 23rd St')).toBe('NW 23 ST');
  });

  it('builds a stable place key', () => {
    expect(placeKey('1420 N.W. 23RD ST.')).toBe('1420 NW 23 ST');
    expect(placeKey('1420 northwest 23 street')).toBe('1420 NW 23 ST');
    expect(placeKey('NW 23rd St')).toBe('NW 23 ST');
  });
});
