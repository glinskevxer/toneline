/**
 * Ticket numbering.
 *
 * A one call centre issues a ticket number that encodes the centre prefix, the
 * date it was taken and a sequence within that date. Revisions of the same dig
 * keep the base number and add a two digit revision, so `B240315000420` and
 * `B240315000420-01` are the same excavation seen twice.
 */

import { TicketError } from './errors.js';

const TICKET_PATTERN = /^([A-Z]{1,3})(\d{6})(\d{6})(?:-(\d{2}))?$/;

/**
 * Split a ticket number into its parts.
 *
 * @param {string} value ticket number as printed on the transmission
 * @returns {{centre: string, taken: string, sequence: number, revision: number, base: string}}
 */
export function parseTicketNumber(value) {
  if (typeof value !== 'string') {
    throw new TicketError('ticket number must be a string', { value });
  }
  const trimmed = value.trim().toUpperCase();
  const match = TICKET_PATTERN.exec(trimmed);
  if (!match) {
    throw new TicketError('ticket number does not match the centre format', { value });
  }
  const [, centre, yymmdd, sequence, revision] = match;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new TicketError('ticket number carries an impossible take date', { value });
  }
  return {
    centre,
    taken: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    sequence: Number(sequence),
    revision: revision ? Number(revision) : 0,
    base: `${centre}${yymmdd}${sequence}`,
  };
}

/**
 * Build a ticket number from its parts.
 *
 * @param {{centre: string, taken: string, sequence: number, revision?: number}} parts
 * @returns {string}
 */
export function formatTicketNumber(parts) {
  const { centre, taken, sequence, revision = 0 } = parts;
  if (!/^[A-Z]{1,3}$/.test(centre ?? '')) {
    throw new TicketError('centre prefix must be one to three capital letters', { centre });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(taken ?? '')) {
    throw new TicketError('take date must be an ISO calendar date', { taken });
  }
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 999999) {
    throw new TicketError('sequence must fit six digits', { sequence });
  }
  if (!Number.isInteger(revision) || revision < 0 || revision > 99) {
    throw new TicketError('revision must fit two digits', { revision });
  }
  const yymmdd = taken.slice(2).replace(/-/g, '');
  const body = `${centre}${yymmdd}${String(sequence).padStart(6, '0')}`;
  return revision === 0 ? body : `${body}-${String(revision).padStart(2, '0')}`;
}

/** The revision free form of a ticket number, used to group a dig's history. */
export function baseTicketNumber(value) {
  return parseTicketNumber(value).base;
}

/** True when two ticket numbers describe the same excavation. */
export function sameExcavation(left, right) {
  return baseTicketNumber(left) === baseTicketNumber(right);
}

/** The next revision of a ticket number. */
export function nextRevision(value) {
  const parts = parseTicketNumber(value);
  if (parts.revision >= 99) {
    throw new TicketError('ticket has exhausted its revision range', { value });
  }
  return formatTicketNumber({
    centre: parts.centre,
    taken: parts.taken,
    sequence: parts.sequence,
    revision: parts.revision + 1,
  });
}
