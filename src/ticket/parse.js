/**
 * Transmission to ticket.
 *
 * The mapping from the centre's labels onto the ticket record, kept apart from
 * both the text reader and the record builder so a centre that renames a label
 * is one table change here and nothing else.
 */

import { FeedParseError } from '../core/errors.js';
import {
  field,
  flagField,
  listField,
  parseTransmission,
  requiredField,
  splitTransmissions,
} from '../io/transmission.js';
import { parseCentreDate, parseCentreStamp } from '../time/formats.js';
import { buildTicket } from './record.js';

const GRID_POINT = /^(-?\d+(?:\.\d+)?)[,;](-?\d+(?:\.\d+)?)$/;

/** Read the coordinate list the centre sends with a drawn dig site. */
export function parseGrids(value) {
  if (value === null || value === undefined || String(value).trim() === '') return [];
  const points = [];
  for (const token of String(value).trim().split(/\s+/)) {
    const match = GRID_POINT.exec(token);
    if (!match) {
      throw new FeedParseError('grid point is not a latitude and longitude pair', { token });
    }
    points.push({ lat: Number(match[1]), lon: Number(match[2]) });
  }
  return points;
}

/** Turn a parsed transmission into the loose record a ticket is built from. */
export function transmissionToRecord(parsed) {
  const grids = parseGrids(field(parsed, 'GRIDS'));
  const record = {
    number: requiredField(parsed, 'TICKET NUMBER'),
    type: requiredField(parsed, 'TRANSMISSION'),
    takenAt: parseCentreStamp(requiredField(parsed, 'TAKEN')),
    state: field(parsed, 'STATE'),
    county: field(parsed, 'COUNTY'),
    place: field(parsed, 'PLACE'),
    address: field(parsed, 'ADDRESS'),
    intersection: field(parsed, 'INTERSECTION'),
    workType: field(parsed, 'WORK TYPE'),
    doneFor: field(parsed, 'DONE FOR'),
    extent: field(parsed, 'EXTENT'),
    boring: flagField(parsed, 'BORING'),
    blasting: flagField(parsed, 'BLASTING'),
    whiteLined: flagField(parsed, 'WHITE LINED'),
    depthFeet: readDepth(field(parsed, 'DEPTH')),
    members: listField(parsed, 'MEMBERS'),
    remarks: field(parsed, 'REMARKS'),
    site: grids.length > 0 ? { points: grids } : null,
  };
  const company = field(parsed, 'EXCAVATOR');
  if (company !== null) {
    record.excavator = {
      company,
      contact: field(parsed, 'CONTACT'),
      phone: field(parsed, 'PHONE'),
      email: field(parsed, 'EMAIL'),
    };
  }
  const lawful = field(parsed, 'LAWFUL START');
  if (lawful !== null) record.lawfulStartAt = parseCentreStamp(lawful);
  const expires = field(parsed, 'EXPIRES');
  if (expires !== null) record.expiresOn = parseCentreDate(expires);
  return record;
}

function readDepth(value) {
  if (value === null) return null;
  const match = /(-?\d+(?:\.\d+)?)/.exec(value);
  if (!match) {
    throw new FeedParseError('depth does not carry a number', { value });
  }
  const number = Number(match[1]);
  return /in(ch)?/i.test(value) ? number / 12 : number;
}

/** Read one transmission block straight into a ticket. */
export function parseTicket(text) {
  return buildTicket(transmissionToRecord(parseTransmission(text)));
}

/**
 * Read a batch file into tickets.
 *
 * @param {string} text batch file content
 * @param {object} [options]
 * @param {boolean} [options.skipBad] collect failures instead of throwing
 * @returns {{tickets: object[], failures: Array<{block: number, message: string}>}}
 */
export function parseTicketBatch(text, options = {}) {
  const { skipBad = false } = options;
  const blocks = splitTransmissions(text);
  const tickets = [];
  const failures = [];
  for (let i = 0; i < blocks.length; i += 1) {
    try {
      tickets.push(parseTicket(blocks[i]));
    } catch (err) {
      if (!skipBad) throw err;
      failures.push({ block: i + 1, message: err.message });
    }
  }
  return { tickets, failures };
}
