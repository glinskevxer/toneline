/**
 * Comma separated files.
 *
 * Facility extracts, locator timesheets and carrier statements all arrive as
 * CSV out of somebody else's system, so the reader has to cope with quoted
 * fields, embedded newlines and a byte order mark, and the writer has to quote
 * anything that would break the next system down the line.
 */

import { FeedParseError } from '../core/errors.js';

/**
 * Parse CSV text into rows of raw strings.
 *
 * @param {string} text file content
 * @param {object} [options]
 * @param {string} [options.delimiter] single character field separator
 * @returns {string[][]} one array of fields per row
 */
export function parseRows(text, options = {}) {
  const { delimiter = ',' } = options;
  if (typeof text !== 'string') {
    throw new FeedParseError('csv input must be a string', { type: typeof text });
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1) {
    throw new FeedParseError('csv delimiter must be a single character', { delimiter });
  }
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  let sawAny = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      sawAny = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      sawAny = true;
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawAny = false;
      continue;
    }
    field += ch;
    sawAny = true;
  }
  if (quoted) {
    throw new FeedParseError('csv input ends inside a quoted field', { rows: rows.length + 1 });
  }
  if (sawAny || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV text into records keyed by the header row.
 *
 * @param {string} text file content
 * @param {object} [options]
 * @param {string} [options.delimiter] single character field separator
 * @param {boolean} [options.trim] trim whitespace around every value
 * @returns {Array<Record<string, string>>}
 */
export function parseCsv(text, options = {}) {
  const { trim = true } = options;
  const rows = parseRows(text, options);
  if (rows.length === 0) return [];
  const header = rows[0].map((name) => name.trim());
  const seen = new Set();
  for (const name of header) {
    if (name === '') {
      throw new FeedParseError('csv header has a blank column name', { header });
    }
    if (seen.has(name)) {
      throw new FeedParseError('csv header repeats a column name', { header, name });
    }
    seen.add(name);
  }
  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 1 && row[0].trim() === '') continue;
    if (row.length !== header.length) {
      throw new FeedParseError('csv row does not match the header width', {
        line: i + 1,
        expected: header.length,
        found: row.length,
      });
    }
    const record = {};
    for (let c = 0; c < header.length; c += 1) {
      record[header[c]] = trim ? row[c].trim() : row[c];
    }
    records.push(record);
  }
  return records;
}

/** Quote one field if it needs it. */
export function quoteField(value, delimiter = ',') {
  const text = value === null || value === undefined ? '' : String(value);
  if (text === '') return '';
  const needsQuotes =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Render records as CSV text.
 *
 * @param {Array<Record<string, unknown>>} records rows to write
 * @param {object} [options]
 * @param {string[]} [options.columns] column order, defaults to the first row's keys
 * @param {string} [options.delimiter] single character field separator
 * @param {string} [options.newline] line ending
 */
export function writeCsv(records, options = {}) {
  const { delimiter = ',', newline = '\n' } = options;
  if (!Array.isArray(records)) {
    throw new FeedParseError('csv output needs an array of records', { type: typeof records });
  }
  const columns = options.columns ?? (records.length > 0 ? Object.keys(records[0]) : []);
  if (columns.length === 0) return '';
  const lines = [columns.map((name) => quoteField(name, delimiter)).join(delimiter)];
  for (const record of records) {
    lines.push(columns.map((name) => quoteField(record[name], delimiter)).join(delimiter));
  }
  return lines.join(newline) + newline;
}
