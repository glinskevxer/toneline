/**
 * Tickets as a spreadsheet.
 *
 * Not every centre sends the labelled text format. Some send a csv export, and
 * an operator changing centres should not have to change anything but the
 * reader. The column names are the ones the exports actually use, with the
 * alternatives that turn up in practice accepted alongside them.
 */

import { FeedParseError } from '../core/errors.js';
import { buildTicket } from '../ticket/record.js';
import { parseGrids } from '../ticket/parse.js';
import { formatCentreStamp, parseCentreDate, parseCentreStamp } from '../time/formats.js';
import { parseCsv, writeCsv } from './csv.js';

const COLUMNS = [
  'ticket',
  'transmission',
  'taken',
  'lawful_start',
  'expires',
  'state',
  'county',
  'place',
  'address',
  'intersection',
  'work_type',
  'done_for',
  'excavator',
  'contact',
  'phone',
  'email',
  'extent',
  'boring',
  'blasting',
  'white_lined',
  'depth_ft',
  'members',
  'grids',
  'remarks',
];

function pick(row, ...names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

/** Turn one export row into a ticket. */
export function rowToTicket(row) {
  const number = pick(row, 'ticket', 'ticket_number', 'number');
  if (number === null) {
    throw new FeedParseError('a ticket row has no ticket number', { columns: Object.keys(row) });
  }
  const taken = pick(row, 'taken', 'taken_at', 'received');
  if (taken === null) {
    throw new FeedParseError('a ticket row has no take time', { number });
  }
  const grids = parseGrids(pick(row, 'grids', 'geometry'));
  const excavator = pick(row, 'excavator', 'company');
  return buildTicket({
    number,
    type: pick(row, 'transmission', 'type', 'ticket_type'),
    takenAt: parseCentreStamp(taken),
    lawfulStartAt: optionalStamp(pick(row, 'lawful_start')),
    expiresOn: optionalDate(pick(row, 'expires')),
    state: pick(row, 'state'),
    county: pick(row, 'county'),
    place: pick(row, 'place', 'city'),
    address: pick(row, 'address'),
    intersection: pick(row, 'intersection', 'cross_street'),
    workType: pick(row, 'work_type', 'type_of_work'),
    doneFor: pick(row, 'done_for'),
    excavator:
      excavator === null
        ? null
        : {
            company: excavator,
            contact: pick(row, 'contact'),
            phone: pick(row, 'phone'),
            email: pick(row, 'email'),
          },
    extent: pick(row, 'extent', 'remarks_extent'),
    boring: pick(row, 'boring') ?? 'N',
    blasting: pick(row, 'blasting') ?? 'N',
    whiteLined: pick(row, 'white_lined', 'white_lining') ?? 'N',
    depthFeet: pick(row, 'depth_ft', 'depth'),
    members: pick(row, 'members') ?? [],
    remarks: pick(row, 'remarks'),
    site: grids.length > 0 ? { points: grids } : null,
  });
}

function optionalStamp(value) {
  return value === null ? null : parseCentreStamp(value);
}

function optionalDate(value) {
  return value === null ? null : parseCentreDate(value);
}

/**
 * Read a whole export.
 *
 * @param {string} text csv content
 * @param {object} [options]
 * @param {boolean} [options.skipBad] collect failures instead of throwing
 */
export function readTicketCsv(text, options = {}) {
  const { skipBad = false } = options;
  const rows = parseCsv(text);
  const tickets = [];
  const failures = [];
  rows.forEach((row, index) => {
    try {
      tickets.push(rowToTicket(row));
    } catch (err) {
      if (!skipBad) {
        throw new FeedParseError('a ticket row could not be read', {
          row: index + 2,
          reason: err.message,
        });
      }
      failures.push({ row: index + 2, message: err.message });
    }
  });
  return { tickets, failures };
}

/** Write tickets back out in the same shape. */
export function writeTicketCsv(tickets) {
  const rows = tickets.map((ticket) => ({
    ticket: ticket.number,
    transmission: ticket.type,
    taken: formatCentreStamp(ticket.takenAt),
    lawful_start: ticket.lawfulStartAt === null ? null : formatCentreStamp(ticket.lawfulStartAt),
    expires: ticket.expiresOn,
    state: ticket.state,
    county: ticket.county,
    place: ticket.place,
    address: ticket.address,
    intersection: ticket.intersection,
    work_type: ticket.workType,
    done_for: ticket.doneFor,
    excavator: ticket.excavator?.company ?? null,
    contact: ticket.excavator?.contact ?? null,
    phone: ticket.excavator?.phone ?? null,
    email: ticket.excavator?.email ?? null,
    extent: ticket.extent,
    boring: ticket.boring ? 'Y' : 'N',
    blasting: ticket.blasting ? 'Y' : 'N',
    white_lined: ticket.whiteLined ? 'Y' : 'N',
    depth_ft: ticket.depthFeet,
    members: ticket.members.join(' '),
    grids: (ticket.site?.points ?? []).map((point) => `${point.lat},${point.lon}`).join(' '),
    remarks: ticket.remarks,
  }));
  return writeCsv(rows, { columns: COLUMNS });
}
