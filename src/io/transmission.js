/**
 * One call centre transmissions.
 *
 * The centre sends a plain text block per ticket. Every line is one or more
 * `LABEL: value` pairs, a line indented under a label continues the value
 * above it, and a batch file separates blocks with a rule of equals signs.
 * Nothing here knows what a ticket means, only how to get the labelled values
 * out of the text without losing a continuation.
 */

import { FeedParseError } from '../core/errors.js';
import { optionalBoolean } from '../core/fields.js';

const LABEL_SCAN = /(?:^|\s{2,})([A-Z][A-Z0-9 /]{0,24}?):(?=\s|$)/g;
const BLOCK_SEPARATOR = /^[=]{3,}\s*$/;

/** Split a batch file into one text block per ticket. */
export function splitTransmissions(text) {
  if (typeof text !== 'string') {
    throw new FeedParseError('transmission input must be a string', { type: typeof text });
  }
  const blocks = [];
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    if (BLOCK_SEPARATOR.test(line)) {
      if (current.some((entry) => entry.trim() !== '')) blocks.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.some((entry) => entry.trim() !== '')) blocks.push(current.join('\n'));
  return blocks;
}

/**
 * Find every label on one line.
 *
 * A label sits at the start of the line or behind at least two spaces, which is
 * how the centre lines its columns up. One space is not enough, or `TICKET
 * NUMBER` would read as a value called `TICKET` followed by a label.
 *
 * @returns {Array<{label: string, from: number, valueFrom: number}>}
 */
export function scanLabels(line) {
  const found = [];
  LABEL_SCAN.lastIndex = 0;
  let match = LABEL_SCAN.exec(line);
  while (match !== null) {
    found.push({
      label: match[1].replace(/\s+/g, ' ').trim(),
      from: match.index,
      valueFrom: match.index + match[0].length,
    });
    match = LABEL_SCAN.exec(line);
  }
  return found;
}

/**
 * Read one transmission block into its labelled fields.
 *
 * @param {string} text one block of transmission text
 * @returns {{fields: Record<string, string>, labels: string[]}}
 */
export function parseTransmission(text) {
  if (typeof text !== 'string') {
    throw new FeedParseError('transmission input must be a string', { type: typeof text });
  }
  const fields = new Map();
  const labels = [];
  let lastLabel = null;

  const append = (label, value, line) => {
    const trimmed = value.trim();
    if (label === null) {
      throw new FeedParseError('transmission starts with a continuation line', { line });
    }
    const existing = fields.get(label);
    if (existing === undefined) {
      fields.set(label, trimmed);
      labels.push(label);
    } else {
      fields.set(label, `${existing} ${trimmed}`.trim());
    }
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const marks = scanLabels(line);
    if (marks.length === 0) {
      append(lastLabel, line, i + 1);
      continue;
    }
    if (line.slice(0, marks[0].from).trim() !== '') {
      append(lastLabel, line.slice(0, marks[0].from), i + 1);
    }
    for (let m = 0; m < marks.length; m += 1) {
      const end = m + 1 < marks.length ? marks[m + 1].from : line.length;
      append(marks[m].label, line.slice(marks[m].valueFrom, end), i + 1);
      lastLabel = marks[m].label;
    }
  }
  if (labels.length === 0) {
    throw new FeedParseError('transmission block carries no fields at all', {});
  }
  return { fields: Object.fromEntries(fields), labels };
}

/** Read a field, returning the fallback when it is absent or blank. */
export function field(parsed, label, fallback = null) {
  const value = parsed.fields[label];
  return value === undefined || value === '' ? fallback : value;
}

/** Read a field that has to be there. */
export function requiredField(parsed, label) {
  const value = field(parsed, label);
  if (value === null) {
    throw new FeedParseError('transmission is missing a required field', {
      label,
      present: parsed.labels,
    });
  }
  return value;
}

/** Read a field as a whitespace separated list. */
export function listField(parsed, label) {
  const value = field(parsed, label);
  if (value === null) return [];
  return value.split(/[\s,]+/).filter((entry) => entry !== '');
}

/** Read a field as a yes or no flag. */
export function flagField(parsed, label, fallback = false) {
  const value = field(parsed, label);
  try {
    return optionalBoolean(value, label, fallback);
  } catch {
    throw new FeedParseError('transmission flag is neither yes nor no', { label, value });
  }
}
