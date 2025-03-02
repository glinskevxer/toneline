import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readJournalFile,
  openBookFile,
  writeJournalFile,
  saveBookFile,
  peekJournalFile,
} from '../../src/store/file.js';
import { JOURNAL_VERSION, JournalError, emptyJournal } from '../../src/store/journal.js';
import { DeskBook } from '../../src/store/book.js';
import { ConfigError } from '../../src/core/errors.js';

const TICKET = {
  number: 'B240315000420',
  type: 'NORMAL',
  takenAt: '2024-03-15T07:42',
  address: '1420 NW 23RD ST',
};

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'toneline-journal-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readJournalFile', () => {
  it('reads an empty journal when the file is not there yet', () => {
    expect(readJournalFile(join(dir, 'missing.json'))).toEqual(emptyJournal());
  });

  it('reads a journal that was written', () => {
    const path = join(dir, 'book.json');
    writeJournalFile(path, { ...emptyJournal(), tickets: [TICKET] });
    expect(readJournalFile(path).tickets).toHaveLength(1);
  });

  it('refuses a journal that will not read and names the file', () => {
    const path = join(dir, 'book.json');
    writeFileSync(
      path,
      JSON.stringify({ version: JOURNAL_VERSION, tickets: [{ number: 'nope' }] })
    );
    try {
      readJournalFile(path);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JournalError);
      expect(err.details.path).toContain('book.json');
      expect(err.details.reason).toMatch(/could not be read/);
    }
  });

  it('refuses a file that is not json at all', () => {
    const path = join(dir, 'book.json');
    writeFileSync(path, 'not json');
    expect(() => readJournalFile(path)).toThrow(ConfigError);
  });
});

describe('writeJournalFile', () => {
  it('writes and reads back', () => {
    const path = join(dir, 'book.json');
    expect(writeJournalFile(path, { ...emptyJournal(), tickets: [TICKET] })).toBe(path);
    expect(peekJournalFile(path).tickets).toBe(1);
  });

  it('leaves no temporary file behind', () => {
    const path = join(dir, 'book.json');
    writeJournalFile(path, emptyJournal());
    expect(readdirSync(dir)).toEqual(['book.json']);
  });

  it('refuses to write a journal that will not read', () => {
    const path = join(dir, 'book.json');
    expect(() => writeJournalFile(path, { version: 99 })).toThrow(JournalError);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('leaves the old journal alone when the new one is refused', () => {
    const path = join(dir, 'book.json');
    writeJournalFile(path, { ...emptyJournal(), tickets: [TICKET] });
    expect(() => writeJournalFile(path, { version: 99 })).toThrow(JournalError);
    expect(peekJournalFile(path).tickets).toBe(1);
  });
});

describe('openBookFile and saveBookFile', () => {
  it('opens an empty book when there is no file', () => {
    expect(openBookFile(join(dir, 'missing.json')).counts().excavations).toBe(0);
  });

  it('round trips a book through a file', () => {
    const path = join(dir, 'book.json');
    const book = new DeskBook();
    book.addTicket(TICKET);
    book.note({ at: '2024-03-15T08:00', subject: TICKET.number, action: 'screened', by: 'k' });
    saveBookFile(path, book);

    const again = openBookFile(path);
    expect(again.counts()).toEqual(book.counts());
    expect(again.fileFor(TICKET.number).trail).toHaveLength(1);
  });

  it('appends a second day onto the same file', () => {
    const path = join(dir, 'book.json');
    const book = new DeskBook();
    book.addTicket(TICKET);
    saveBookFile(path, book);

    const second = openBookFile(path);
    second.addTicket({ ...TICKET, number: 'B240315000421' });
    saveBookFile(path, second);

    expect(peekJournalFile(path).tickets).toBe(2);
  });
});
