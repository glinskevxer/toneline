/**
 * Wiring the command line to the library.
 *
 * Commands should not each know how to find a configuration file, so this
 * builds the desk once from the path the user gave and hands back everything a
 * command needs. Output goes through the writers passed in rather than straight
 * to the console, which is what makes the commands testable.
 */

import { asTonelineError } from '../core/errors.js';
import { readConfigWithFacilities, readText } from '../io/files.js';
import { readFacilityCsv } from '../io/facilities.js';
import { loadDesk } from '../config/load.js';
import { parseTicketBatch } from '../ticket/parse.js';

/** Build the writers a command prints through. */
export function makeWriters({ out = process.stdout, err = process.stderr } = {}) {
  return {
    write: (text) => out.write(text),
    line: (text = '') => out.write(`${text}\n`),
    warn: (text) => err.write(`${text}\n`),
  };
}

/** Load the desk named by a configuration path. */
export function openDesk(configPath, options = {}) {
  const { config, facilities, facilitiesPath } = readConfigWithFacilities(configPath, {
    readFacilities: readFacilityCsv,
  });
  const desk = loadDesk(config, { facilities, failOnWarning: options.failOnWarning ?? false });
  return { desk, config, facilitiesPath };
}

/** Read a feed file into tickets, keeping any blocks that would not read. */
export function readFeed(feedPath, { skipBad = false } = {}) {
  return parseTicketBatch(readText(feedPath), { skipBad });
}

/**
 * Run a command body and turn any failure into a message and an exit code.
 *
 * @param {object} writers what to print through
 * @param {Function} body the command body
 * @returns {number} the exit code
 */
export function runCommand(writers, body) {
  try {
    const result = body();
    return typeof result === 'number' ? result : 0;
  } catch (raw) {
    const err = asTonelineError(raw);
    writers.warn(`${err.code}: ${err.message}`);
    for (const [key, value] of Object.entries(err.details ?? {})) {
      writers.warn(`  ${key}: ${renderDetail(value)}`);
    }
    return 1;
  }
}

function renderDetail(value) {
  if (Array.isArray(value)) {
    return value.length > 6
      ? `${value.slice(0, 6).join(', ')} and ${value.length - 6} more`
      : value.join(', ');
  }
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
