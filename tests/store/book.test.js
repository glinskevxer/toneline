import { describe, expect, it } from 'vitest';
import { BookError, DeskBook, openBook, peekHead, peekJournal } from '../../src/store/book.js';
import { JOURNAL_VERSION, emptyJournal } from '../../src/store/journal.js';

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

describe('DeskBook', () => {
  it('opens empty', () => {
    const book = new DeskBook();
    expect(book.counts()).toEqual({
      excavations: 0,
      transmissions: 0,
      responses: 0,
      assignments: 0,
      damages: 0,
      audit: 0,
    });
  });

  it('opens on a journal', () => {
    const book = openBook(full());
    expect(book.counts()).toEqual({
      excavations: 1,
      transmissions: 1,
      responses: 1,
      assignments: 1,
      damages: 1,
      audit: 1,
    });
  });

  it('opens empty when handed nothing', () => {
    expect(openBook().counts().excavations).toBe(0);
  });

  it('takes new records of every kind', () => {
    const book = new DeskBook();
    expect(book.addTicket(TICKET).number).toBe('B240315000420');
    expect(book.addResponse(RESPONSE).key).toBe('MARKED');
    expect(book.addAssignment(ASSIGNMENT).locatorId).toBe('LOC-14');
    expect(book.addDamage(DAMAGE).id).toBe('DMG-1');
    expect(book.note(AUDIT).action).toBe('screened');
    expect(book.counts().excavations).toBe(1);
  });

  it('takes an already built record without rebuilding it', () => {
    const book = openBook(full());
    const assignment = book.assignments[0];
    expect(book.addAssignment(assignment)).toBe(assignment);
    const damage = book.damages[0];
    expect(book.addDamage(damage)).toBe(damage);
  });

  it('refuses a record that will not build', () => {
    const book = new DeskBook();
    expect(() => book.addTicket({ ...TICKET, type: 'ROUTINE' })).toThrow();
    expect(book.counts().excavations).toBe(0);
  });
});

describe('fileFor', () => {
  it('gathers everything about one ticket', () => {
    const file = openBook(full()).fileFor('b240315000420');
    expect(file.ticket.number).toBe('B240315000420');
    expect(file.responses).toHaveLength(1);
    expect(file.standing).toHaveLength(1);
    expect(file.assignments).toHaveLength(1);
    expect(file.damages).toHaveLength(1);
    expect(file.trail).toHaveLength(1);
  });

  it('gathers the whole transmission history', () => {
    const book = openBook(full());
    book.addTicket({ ...TICKET, number: 'B240315000420-01', type: 'UPDATE' });
    const file = book.fileFor('B240315000420');
    expect(file.history).toHaveLength(2);
    expect(file.ticket.revision).toBe(1);
  });

  it('leaves out records against another ticket', () => {
    const book = openBook(full());
    book.addTicket({ ...TICKET, number: 'B240315000421' });
    expect(book.fileFor('B240315000421').responses).toEqual([]);
  });

  it('refuses a ticket it does not hold', () => {
    expect(() => new DeskBook().fileFor('B240315000420')).toThrow(BookError);
  });

  it('answers the has question', () => {
    const book = openBook(full());
    expect(book.has('B240315000420')).toBe(true);
    expect(book.has('B240315000999')).toBe(false);
  });
});

describe('toJournal', () => {
  it('round trips through a journal', () => {
    const book = openBook(full());
    const again = openBook(book.toJournal());
    expect(again.counts()).toEqual(book.counts());
  });

  it('carries new records into the journal', () => {
    const book = openBook(full());
    book.addTicket({ ...TICKET, number: 'B240315000421' });
    expect(peekJournal(book.toJournal()).tickets).toBe(2);
  });

  it('writes an empty book as an empty journal', () => {
    expect(peekJournal(new DeskBook().toJournal())).toEqual(peekJournal(emptyJournal()));
  });
});

describe('the sealed trail', () => {
  it('seals an empty book to the genesis digest', () => {
    expect(new DeskBook().head()).toMatch(/^0{64}$/);
  });

  it('changes the head when a line is written', () => {
    const book = new DeskBook();
    const before = book.head();
    book.note(AUDIT);
    expect(book.head()).not.toBe(before);
  });

  it('agrees with the journal it writes', () => {
    const book = openBook(full());
    expect(peekHead(book.toJournal())).toBe(book.head());
  });

  it('verifies its own trail', () => {
    const book = openBook(full());
    expect(book.verify()).toEqual({ sound: true, brokenAt: null, reason: null });
  });

  it('gives two books with the same trail the same head', () => {
    const first = openBook(full());
    const second = openBook(first.toJournal());
    expect(second.head()).toBe(first.head());
  });

  it('gives two books with different trails different heads', () => {
    const first = openBook(full());
    const second = openBook(full());
    second.note({ ...AUDIT, at: '2024-03-15T09:00', action: 'closed' });
    expect(second.head()).not.toBe(first.head());
  });
});
