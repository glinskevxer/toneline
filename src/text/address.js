/**
 * Street and address text.
 *
 * A transmission is typed by a call taker, so the same block arrives as
 * "N.W. 23RD ST", "NW 23rd Street" and "northwest 23 st" on three different
 * tickets. Screening and duplicate detection both compare street text, so it is
 * reduced to one canonical form first.
 */

const DIRECTIONALS = new Map([
  ['n', 'N'],
  ['north', 'N'],
  ['s', 'S'],
  ['south', 'S'],
  ['e', 'E'],
  ['east', 'E'],
  ['w', 'W'],
  ['west', 'W'],
  ['ne', 'NE'],
  ['northeast', 'NE'],
  ['nw', 'NW'],
  ['northwest', 'NW'],
  ['se', 'SE'],
  ['southeast', 'SE'],
  ['sw', 'SW'],
  ['southwest', 'SW'],
]);

const SUFFIXES = new Map([
  ['st', 'ST'],
  ['street', 'ST'],
  ['ave', 'AVE'],
  ['av', 'AVE'],
  ['avenue', 'AVE'],
  ['blvd', 'BLVD'],
  ['boulevard', 'BLVD'],
  ['rd', 'RD'],
  ['road', 'RD'],
  ['dr', 'DR'],
  ['drive', 'DR'],
  ['ln', 'LN'],
  ['lane', 'LN'],
  ['ct', 'CT'],
  ['court', 'CT'],
  ['cir', 'CIR'],
  ['circle', 'CIR'],
  ['pl', 'PL'],
  ['place', 'PL'],
  ['pkwy', 'PKWY'],
  ['parkway', 'PKWY'],
  ['hwy', 'HWY'],
  ['highway', 'HWY'],
  ['ter', 'TER'],
  ['terrace', 'TER'],
  ['trl', 'TRL'],
  ['trail', 'TRL'],
  ['way', 'WAY'],
  ['expy', 'EXPY'],
  ['expressway', 'EXPY'],
]);

const ORDINAL_PATTERN = /^(\d+)(st|nd|rd|th)$/;

/**
 * Strip punctuation, collapse space and upper case.
 *
 * A full stop is dropped rather than turned into a space, because a call taker
 * writes a directional as `N.W.` and splitting that into two tokens loses it.
 */
export function squash(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\./g, '')
    .replace(/[,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Split text into comparison tokens. */
export function tokenise(value) {
  const squashed = squash(value);
  return squashed === '' ? [] : squashed.split(' ');
}

/** Expand a directional abbreviation, or return null when it is not one. */
export function directional(token) {
  return DIRECTIONALS.get(String(token ?? '').toLowerCase()) ?? null;
}

/** Expand a street suffix abbreviation, or return null when it is not one. */
export function streetSuffix(token) {
  return SUFFIXES.get(String(token ?? '').toLowerCase()) ?? null;
}

/**
 * Reduce a street name to its canonical form.
 *
 * Directionals and suffixes collapse to their standard abbreviation, ordinals
 * lose their suffix so `23RD` and `23` compare equal, and everything else is
 * squashed to upper case.
 */
export function normaliseStreet(value) {
  const tokens = tokenise(value);
  const out = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const asDirectional = DIRECTIONALS.get(lower);
    if (asDirectional) {
      out.push(asDirectional);
      continue;
    }
    const asSuffix = SUFFIXES.get(lower);
    if (asSuffix) {
      out.push(asSuffix);
      continue;
    }
    const ordinal = ORDINAL_PATTERN.exec(lower);
    out.push(ordinal ? ordinal[1] : token);
  }
  return out.join(' ');
}

/** True when two street names refer to the same street. */
export function sameStreet(left, right) {
  return normaliseStreet(left) === normaliseStreet(right) && normaliseStreet(left) !== '';
}

/** Pull the leading house number out of an address line, if there is one. */
export function houseNumber(value) {
  const match = /^(\d+)(?:\s|$)/.exec(squash(value));
  return match ? Number(match[1]) : null;
}

/** The street part of an address line, with any house number removed. */
export function streetOf(value) {
  const squashed = squash(value);
  const withoutNumber = squashed.replace(/^\d+\s+/, '');
  return normaliseStreet(withoutNumber);
}

/** A stable key for a place, used by duplicate detection. */
export function placeKey(value) {
  const number = houseNumber(value);
  const street = streetOf(value);
  return number === null ? street : `${number} ${street}`;
}
