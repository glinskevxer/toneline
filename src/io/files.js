/**
 * Reading and writing files.
 *
 * The one place in the library that touches the disk. Every failure comes back
 * as one of our own errors naming the path, because a bare `ENOENT` from deep
 * inside a report is no use to whoever typed the command.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigError, FeedParseError } from '../core/errors.js';

/** Read a text file, naming the path when it cannot be read. */
export function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    throw new FeedParseError('the file could not be read', {
      path: resolve(path),
      reason: err.code ?? err.message,
    });
  }
}

/** Read and parse a JSON file. */
export function readJson(path) {
  const text = readText(path);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ConfigError('the file is not valid json', {
      path: resolve(path),
      reason: err.message,
    });
  }
}

/** Write text, making the directory above it when it is missing. */
export function writeText(path, text) {
  const target = resolve(path);
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  } catch (err) {
    throw new FeedParseError('the file could not be written', {
      path: target,
      reason: err.code ?? err.message,
    });
  }
  return target;
}

/** Write a value as indented JSON with a trailing newline. */
export function writeJson(path, value) {
  return writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** True when the path is there. */
export function exists(path) {
  return existsSync(path);
}

/**
 * Read a configuration file and a facility extract named beside it.
 *
 * The configuration names its facility file relative to itself, which is how an
 * operator keeps a whole desk in one directory that can be copied about.
 */
export function readConfigWithFacilities(path, { readFacilities }) {
  const config = readJson(path);
  if (typeof config.facilities !== 'string' || config.facilities.trim() === '') {
    return { config, facilities: [], facilitiesPath: null };
  }
  const facilitiesPath = resolve(dirname(resolve(path)), config.facilities);
  const { facilities, failures } = readFacilities(readText(facilitiesPath));
  if (failures && failures.length > 0) {
    throw new FeedParseError('the facility extract has rows that cannot be read', {
      path: facilitiesPath,
      failures: failures.slice(0, 5),
    });
  }
  return { config, facilities, facilitiesPath };
}
