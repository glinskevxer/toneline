/**
 * Damage extracts.
 *
 * Damage reports are typed into the field application and come out as one row
 * each. The columns are the operator's own, not the centre's, so the mapping is
 * kept here beside the facility reader rather than inside the damage record.
 */

import { FeedParseError } from '../core/errors.js';
import { buildDamage } from '../damage/report.js';
import { formatCentreStamp, parseCentreStamp } from '../time/formats.js';
import { parseCsv, writeCsv } from './csv.js';

/** Read the coordinate column, which may be empty. */
export function parseDamagePoint(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)\s*$/.exec(String(value));
  if (!match) {
    throw new FeedParseError('a damage point must be a latitude and a longitude', { value });
  }
  return { lat: Number(match[1]), lon: Number(match[2]) };
}

/** Turn one extract row into a damage record. */
export function rowToDamage(row) {
  return buildDamage({
    id: row.id ?? row.damage_id,
    at: parseCentreStamp(row.at ?? row.occurred ?? ''),
    ticketNumber: emptyToNull(row.ticket),
    facilityId: emptyToNull(row.facility),
    facilityType: row.type ?? row.facility_type,
    point: parseDamagePoint(row.point ?? row.location),
    excavator: emptyToNull(row.excavator),
    method: row.method ?? 'OTHER',
    depthFeet: emptyToNull(row.depth_ft),
    marksPresent: row.marks_present ?? 'N',
    marksAccurate: emptyToNull(row.marks_accurate),
    ticketValid: row.ticket_valid ?? 'N',
    serviceInterrupted: row.service_out ?? 'N',
    customersOut: row.customers_out ?? 0,
    injury: row.injury ?? 'N',
    ignition: row.ignition ?? 'N',
    reportedBy: row.reported_by,
    narrative: emptyToNull(row.narrative),
  });
}

function emptyToNull(value) {
  return value === undefined || value === null || String(value).trim() === '' ? null : value;
}

/**
 * Read a whole damage extract.
 *
 * @param {string} text csv content
 * @param {object} [options]
 * @param {boolean} [options.skipBad] collect failures instead of throwing
 */
export function readDamageCsv(text, options = {}) {
  const { skipBad = false } = options;
  const rows = parseCsv(text);
  const damages = [];
  const failures = [];
  rows.forEach((row, index) => {
    try {
      damages.push(rowToDamage(row));
    } catch (err) {
      if (!skipBad) {
        throw new FeedParseError('a damage row could not be read', {
          row: index + 2,
          reason: err.message,
        });
      }
      failures.push({ row: index + 2, message: err.message });
    }
  });
  return { damages, failures };
}

const COLUMNS = [
  'id',
  'at',
  'ticket',
  'facility',
  'type',
  'point',
  'excavator',
  'method',
  'depth_ft',
  'marks_present',
  'marks_accurate',
  'ticket_valid',
  'service_out',
  'customers_out',
  'injury',
  'ignition',
  'reported_by',
  'narrative',
];

/** Write damages back out in the same shape. */
export function writeDamageCsv(damages) {
  const rows = damages.map((damage) => ({
    id: damage.id,
    at: formatCentreStamp(damage.at),
    ticket: damage.ticketNumber,
    facility: damage.facilityId,
    type: damage.facilityType,
    point: damage.point === null ? null : `${damage.point.lat} ${damage.point.lon}`,
    excavator: damage.excavator,
    method: damage.method,
    depth_ft: damage.depthFeet,
    marks_present: flag(damage.marksPresent),
    marks_accurate: damage.marksAccurate === null ? null : flag(damage.marksAccurate),
    ticket_valid: flag(damage.ticketValid),
    service_out: flag(damage.serviceInterrupted),
    customers_out: damage.customersOut,
    injury: flag(damage.injury),
    ignition: flag(damage.ignition),
    reported_by: damage.reportedBy,
    narrative: damage.narrative,
  }));
  return writeCsv(rows, { columns: COLUMNS });
}

function flag(value) {
  return value ? 'Y' : 'N';
}
