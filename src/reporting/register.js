/**
 * The ticket register.
 *
 * The record the regulator asks for after an incident: one row per ticket, with
 * what was received, what the desk worked out, what it said and whether the
 * ground was later dug into. It is built from the same objects the desk runs on
 * so there is nothing to keep in step by hand.
 */

import { deepFreeze } from '../core/fields.js';
import { writeCsv } from '../io/csv.js';
import { formatCentreDate, formatCentreStamp } from '../time/formats.js';
import { effectiveExpiry } from '../ticket/expiry.js';
import { effectiveLawfulStart } from '../ticket/lawfulStart.js';
import { latestResponse } from '../response/post.js';

/**
 * Build one register row.
 *
 * @param {object} ticket
 * @param {object} args
 * @param {object[]} [args.responses] postings against the ticket
 * @param {object} [args.screening] the screening result
 * @param {object} [args.compliance] the compliance evaluation
 * @param {object[]} [args.damages] damages recorded against the ticket
 */
export function registerRow(ticket, args = {}) {
  const { responses = [], screening = null, compliance = null, damages = [], ...options } = args;
  const mine = responses.filter((response) => response.number === ticket.number);
  const last = latestResponse(mine);
  const hit = damages.filter((damage) => damage.ticketNumber === ticket.number);
  return deepFreeze({
    number: ticket.number,
    type: ticket.type,
    status: ticket.status,
    takenAt: ticket.takenAt,
    lawfulStartAt: effectiveLawfulStart(ticket, options),
    expiresOn: effectiveExpiry(ticket, options),
    place: ticket.place,
    address: ticket.address,
    excavator: ticket.excavator?.company ?? null,
    districts: screening === null ? [] : screening.districts,
    facilitiesFound: screening === null ? null : screening.hits.length,
    conflict: screening === null ? null : screening.conflict,
    responseCode: last === null ? null : last.code,
    respondedAt: last === null ? null : last.at,
    onTime: compliance === null ? null : compliance.onTime,
    minutesLate: compliance === null ? null : compliance.minutesLate,
    damages: hit.length,
  });
}

/** Build the whole register, oldest ticket first. */
export function buildRegister(tickets, args = {}) {
  return tickets
    .map((ticket) => registerRow(ticket, args))
    .sort(
      (left, right) =>
        left.takenAt.localeCompare(right.takenAt) || left.number.localeCompare(right.number)
    );
}

const COLUMNS = [
  'ticket',
  'type',
  'status',
  'taken',
  'lawful_start',
  'expires',
  'place',
  'address',
  'excavator',
  'districts',
  'facilities',
  'conflict',
  'response',
  'responded',
  'on_time',
  'minutes_late',
  'damages',
];

/** Render the register as csv in the shape the regulator asks for. */
export function writeRegisterCsv(rows) {
  const records = rows.map((row) => ({
    ticket: row.number,
    type: row.type,
    status: row.status,
    taken: formatCentreStamp(row.takenAt),
    lawful_start: formatCentreStamp(row.lawfulStartAt),
    expires: formatCentreDate(row.expiresOn),
    place: row.place,
    address: row.address,
    excavator: row.excavator,
    districts: row.districts.join(' '),
    facilities: row.facilitiesFound,
    conflict: flag(row.conflict),
    response: row.responseCode,
    responded: row.respondedAt === null ? null : formatCentreStamp(row.respondedAt),
    on_time: flag(row.onTime),
    minutes_late: row.minutesLate,
    damages: row.damages,
  }));
  return writeCsv(records, { columns: COLUMNS });
}

function flag(value) {
  if (value === null || value === undefined) return null;
  return value ? 'Y' : 'N';
}

/** Only the rows a reviewer has to look at. */
export function registerExceptions(rows) {
  return rows.filter((row) => row.damages > 0 || row.onTime === false || row.responseCode === null);
}

/** A count of the response codes used across the register. */
export function responseCodeCounts(rows) {
  const counts = {};
  for (const row of rows) {
    const key = row.responseCode ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
