import { describe, expect, it } from 'vitest';
import {
  JOURNAL_VERSION,
  JournalError,
  emptyJournal,
  readJournal,
  writeJournal,
  appendToJournal,
  journalCounts,
  journalForTicket,
  journalHead,
} from '../../src/store/journal.js';
import { GENESIS } from '../../src/audit/chain.js';

const TICKET = {
  number: 'B240315000420',
  type: 'NORMAL',
  takenAt: '2024-03-15T07:42',
  address: '1420 NW 23RD ST',
};

const RESPONSE = {
  number: 'B240315000420',
  code: '2',
  at: '2024-03-16T09:40',
  by: 'loc-14',
  marksThrough: '2024-03-29',
};

const ASSIGNMENT = {
  number: 'B240315000420',
  locatorId: 'loc-14',
  at: '2024-03-15T08:30',
  by: 'dispatch',
};

const DAMAGE = {
  id: 'dmg-1',
  at: '2024-03-19T10:25',
  ticketNumber: 'B240315000420',
  facilityType: 'gas',
  reportedBy: 'loc-14',
};

const AUDIT = {
  at: '2024-03-15T08:00',
  subject: 'B240315000420',
  action: 'screened',
  by: 'kmartel',
};

function full() {
  return {
    version: JOURNAL_VERSION,
    tickets: [TICKET],
    responses: [RESPONSE],
    assignments: [ASSIGNMENT],
    damages: [DAMAGE],
    audit: [AUDIT],
  };
}

describe('emptyJournal', () => {
  it('has every section and the current version', () => {
    const journal = emptyJournal();
    expect(journal.version).toBe(JOURNAL_VERSION);
    expect(journalCounts(journal)).toEqual({
      tickets: 0,
      responses: 0,
      assignments: 0,
      damages: 0,
      audit: 0,
    });
  });
});

describe('readJournal', () => {
  it('builds every record', () => {
    const journal = readJournal(full());
    expect(journal.tickets[0].base).toBe('B240315000420');
    expect(journal.responses[0].key).toBe('MARKED');
    expect(journal.assignments[0].locatorId).toBe('LOC-14');
    expect(journal.damages[0].id).toBe('DMG-1');
    expect(journal.audit[0].action).toBe('screened');
    expect(Object.isFrozen(journal)).toBe(true);
  });

  it('fills in a missing section', () => {
    const journal = readJournal({ version: JOURNAL_VERSION, tickets: [TICKET] });
    expect(journal.responses).toEqual([]);
  });

  it('rejects anything that is not an object', () => {
    expect(() => readJournal(null)).toThrow(JournalError);
    expect(() => readJournal([])).toThrow(/must be an object/);
  });

  it('rejects a journal from another build', () => {
    try {
      readJournal({ version: 99 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details).toEqual({ found: 99, expected: JOURNAL_VERSION });
    }
  });

  it('rejects a section that is not a list', () => {
    expect(() => readJournal({ version: JOURNAL_VERSION, tickets: {} })).toThrow(
      /section must be a list/
    );
  });

  it('names the record it could not read', () => {
    try {
      readJournal({ version: JOURNAL_VERSION, tickets: [TICKET, { ...TICKET, type: 'ROUTINE' }] });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.section).toBe('tickets');
      expect(err.details.row).toBe(2);
      expect(err.details.reason).toMatch(/not one this desk handles/);
    }
  });
});

describe('writeJournal', () => {
  it('round trips', () => {
    const journal = readJournal(full());
    expect(readJournal(writeJournal(journal))).toEqual(journal);
  });

  it('writes an empty journal with every section', () => {
    expect(Object.keys(writeJournal(emptyJournal())).sort()).toEqual([
      'assignments',
      'audit',
      'auditHead',
      'damages',
      'responses',
      'tickets',
      'version',
    ]);
  });
});

describe('appendToJournal', () => {
  it('adds without editing the journal it was given', () => {
    const journal = readJournal(emptyJournal());
    const next = appendToJournal(journal, { tickets: [TICKET] });
    expect(journalCounts(journal).tickets).toBe(0);
    expect(journalCounts(next).tickets).toBe(1);
  });

  it('keeps what was there already', () => {
    const journal = readJournal(full());
    const next = appendToJournal(journal, { responses: [{ ...RESPONSE, at: '2024-03-16T11:00' }] });
    expect(journalCounts(next).responses).toBe(2);
    expect(journalCounts(next).tickets).toBe(1);
  });

  it('refuses a record that will not build', () => {
    const journal = readJournal(emptyJournal());
    expect(() => appendToJournal(journal, { tickets: [{ ...TICKET, number: 'nope' }] })).toThrow(
      JournalError
    );
  });
});

describe('journalForTicket', () => {
  it('gathers everything about one ticket', () => {
    const found = journalForTicket(readJournal(full()), 'b240315000420');
    expect(found.tickets).toHaveLength(1);
    expect(found.responses).toHaveLength(1);
    expect(found.assignments).toHaveLength(1);
    expect(found.damages).toHaveLength(1);
    expect(found.audit).toHaveLength(1);
  });

  it('finds nothing about a ticket the journal does not hold', () => {
    const found = journalForTicket(readJournal(full()), 'B240315000999');
    expect(found.tickets).toEqual([]);
    expect(found.damages).toEqual([]);
  });
});

describe('the audit digest on a journal', () => {
  it('seals an empty trail to the genesis digest', () => {
    expect(journalHead(readJournal(emptyJournal()))).toBe(GENESIS);
  });

  it('changes when an entry is added', () => {
    const before = journalHead(readJournal(emptyJournal()));
    expect(journalHead(readJournal(full()))).not.toBe(before);
  });

  it('survives a round trip', () => {
    const journal = readJournal(full());
    expect(journalHead(readJournal(writeJournal(journal)))).toBe(journalHead(journal));
  });

  it('refuses a journal whose trail no longer matches its digest', () => {
    const written = writeJournal(readJournal(full()));
    written.audit[0] = { ...written.audit[0], by: 'somebody else' };
    try {
      readJournal(written);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JournalError);
      expect(err.message).toMatch(/does not match the digest/);
      expect(err.details.entries).toBe(1);
    }
  });

  it('refuses a journal with an entry quietly dropped', () => {
    const written = writeJournal(
      readJournal({ ...full(), audit: [AUDIT, { ...AUDIT, at: '2024-03-15T09:00' }] })
    );
    written.audit = written.audit.slice(1);
    expect(() => readJournal(written)).toThrow(/does not match the digest/);
  });

  it('takes an older journal that carries no digest at all', () => {
    const written = writeJournal(readJournal(full()));
    delete written.auditHead;
    expect(readJournal(written).audit).toHaveLength(1);
  });
});
