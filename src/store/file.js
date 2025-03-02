/**
 * The journal on disk.
 *
 * Reading and writing the book, with the two guards that matter for a file a
 * desk appends to every day: a journal that will not read stops the load rather
 * than half applying, and a write goes to a temporary name and is moved into
 * place, so a machine that dies mid write leaves yesterday's journal intact
 * rather than half of today's.
 */

import { renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { exists, readJson, writeJson } from '../io/files.js';
import { DeskBook } from './book.js';
import { JournalError, emptyJournal, journalCounts, readJournal } from './journal.js';

/** Read a journal file, or an empty journal when the file is not there yet. */
export function readJournalFile(path) {
  if (!exists(path)) return emptyJournal();
  const raw = readJson(path);
  try {
    readJournal(raw);
  } catch (err) {
    throw new JournalError('the journal file cannot be read', {
      path: resolve(path),
      reason: err.message,
      details: err.details ?? null,
    });
  }
  return raw;
}

/** Open the book held in a journal file. */
export function openBookFile(path) {
  return new DeskBook(readJournalFile(path));
}

/**
 * Write a journal out, leaving the old one in place until the new one is whole.
 *
 * @returns {string} the path written
 */
export function writeJournalFile(path, journal) {
  readJournal(journal);
  const target = resolve(path);
  const temporary = `${target}.writing`;
  writeJson(temporary, journal);
  try {
    renameSync(temporary, target);
  } catch (err) {
    try {
      unlinkSync(temporary);
    } catch {
      // the temporary file is already gone, which is the state we wanted
    }
    throw new JournalError('the journal could not be moved into place', {
      path: target,
      reason: err.code ?? err.message,
    });
  }
  return target;
}

/** Save a book to its journal file. */
export function saveBookFile(path, book) {
  return writeJournalFile(path, book.toJournal());
}

/** How many records a journal file holds, without opening a book on it. */
export function peekJournalFile(path) {
  return journalCounts(readJournal(readJournalFile(path)));
}
