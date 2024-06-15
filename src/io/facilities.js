/**
 * Facility extracts.
 *
 * The mapping system exports one row per run of plant, with the geometry in a
 * single column as a run of coordinate pairs. This reads that shape into
 * facility records and writes it back out for anyone who wants a copy.
 */

import { FeedParseError } from '../core/errors.js';
import { buildFacility } from '../network/facility.js';
import { parseCsv, writeCsv } from './csv.js';

const PAIR = /^\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)\s*$/;

/**
 * Read a path column into points.
 *
 * Pairs are separated by a semicolon or a pipe, and inside a pair latitude
 * comes first, which is the order the extract writes and the opposite of the
 * order most map files use.
 */
export function parsePath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FeedParseError('a facility path column cannot be empty', { value });
  }
  const points = [];
  for (const chunk of value.split(/[;|]/)) {
    if (chunk.trim() === '') continue;
    const match = PAIR.exec(chunk);
    if (!match) {
      throw new FeedParseError('a path point must be a latitude and a longitude', { chunk });
    }
    points.push({ lat: Number(match[1]), lon: Number(match[2]) });
  }
  if (points.length < 2) {
    throw new FeedParseError('a facility path needs at least two points', {
      value,
      found: points.length,
    });
  }
  return points;
}

/** Render a path back into the extract's own column format. */
export function formatPath(points) {
  return points.map((point) => `${point.lat} ${point.lon}`).join(';');
}

/** Turn one extract row into a facility record. */
export function rowToFacility(row) {
  return buildFacility({
    id: row.id ?? row.facility_id,
    type: row.type ?? row.facility_type,
    member: row.member ?? null,
    district: row.district ?? null,
    path: parsePath(row.path ?? row.geometry ?? ''),
    depthFeet: row.depth_ft ?? row.depthFeet ?? null,
    diameterInches: row.diameter_in ?? null,
    material: row.material ?? null,
    abandoned: row.abandoned ?? false,
    highConsequence: row.high_consequence ?? false,
    installedOn: row.installed_on ?? null,
    toleranceFeet: row.tolerance_ft ?? null,
    note: row.note ?? null,
  });
}

/**
 * Read a whole extract.
 *
 * @param {string} text csv content
 * @param {object} [options]
 * @param {boolean} [options.skipBad] collect failures instead of throwing
 * @returns {{facilities: object[], failures: Array<{row: number, message: string}>}}
 */
export function readFacilityCsv(text, options = {}) {
  const { skipBad = false } = options;
  const rows = parseCsv(text);
  const facilities = [];
  const failures = [];
  rows.forEach((row, index) => {
    try {
      facilities.push(rowToFacility(row));
    } catch (err) {
      if (!skipBad) {
        throw new FeedParseError('a facility row could not be read', {
          row: index + 2,
          reason: err.message,
        });
      }
      failures.push({ row: index + 2, message: err.message });
    }
  });
  return { facilities, failures };
}

const COLUMNS = [
  'id',
  'type',
  'member',
  'district',
  'path',
  'depth_ft',
  'diameter_in',
  'material',
  'abandoned',
  'high_consequence',
  'installed_on',
  'tolerance_ft',
  'note',
];

/** Write facilities back out in the extract's own shape. */
export function writeFacilityCsv(facilities) {
  const rows = facilities.map((facility) => ({
    id: facility.id,
    type: facility.type,
    member: facility.member,
    district: facility.district,
    path: formatPath(facility.path),
    depth_ft: facility.depthFeet,
    diameter_in: facility.diameterInches,
    material: facility.material,
    abandoned: facility.abandoned ? 'Y' : 'N',
    high_consequence: facility.highConsequence ? 'Y' : 'N',
    installed_on: facility.installedOn,
    tolerance_ft: facility.toleranceFeet,
    note: facility.note,
  }));
  return writeCsv(rows, { columns: COLUMNS });
}
