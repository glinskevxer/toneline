import { describe, expect, it } from 'vitest';
import { AuditError, AuditTrail, auditEntry, formatEntry } from '../../src/audit/trail.js';

const ENTRY = {
  at: '2024-03-15T08:00',
  subject: 'b240315000420',
  action: 'SCREENED',
  by: 'kmartel',
  detail: 'one gas main in the tolerance zone',
};

describe('auditEntry', () => {
  it('normalises the subject and the action', () => {
    const entry = auditEntry(ENTRY);
    expect(entry.subject).toBe('B240315000420');
    expect(entry.action).toBe('screened');
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('copies and freezes the data bag', () => {
    const data = { hits: 1 };
    const entry = auditEntry({ ...ENTRY, data });
    data.hits = 2;
    expect(entry.data).toEqual({ hits: 1 });
    expect(Object.isFrozen(entry.data)).toBe(true);
  });

  it('leaves the data bag null when there is none', () => {
    expect(auditEntry(ENTRY).data).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(() => auditEntry(null)).toThrow(AuditError);
  });

  it('rejects a bad timestamp or a missing field', () => {
    expect(() => auditEntry({ ...ENTRY, at: '2024-03-15' })).toThrow(/needs a timestamp/);
    expect(() => auditEntry({ ...ENTRY, by: '' })).toThrow(/by is required/);
    expect(() => auditEntry({ ...ENTRY, subject: null })).toThrow(/subject is required/);
  });
});

describe('AuditTrail', () => {
  function trail() {
    return new AuditTrail([
      ENTRY,
      { ...ENTRY, at: '2024-03-16T09:40', action: 'responded', by: 'locator-14' },
      { ...ENTRY, at: '2024-03-15T07:45', action: 'received', by: 'feed' },
      { ...ENTRY, subject: 'B240315000421', at: '2024-03-15T09:00', action: 'screened' },
    ]);
  }

  it('counts what it holds', () => {
    expect(trail().size).toBe(4);
    expect(new AuditTrail().size).toBe(0);
  });

  it('appends and hands the entry back', () => {
    const log = new AuditTrail();
    const entry = log.append(ENTRY);
    expect(log.size).toBe(1);
    expect(entry.action).toBe('screened');
  });

  it('appends several at once', () => {
    const log = new AuditTrail();
    expect(log.appendAll([ENTRY, { ...ENTRY, action: 'closed' }])).toHaveLength(2);
  });

  it('refuses a bad entry rather than half writing it', () => {
    const log = new AuditTrail();
    expect(() => log.append({ ...ENTRY, at: 'never' })).toThrow(AuditError);
    expect(log.size).toBe(0);
  });

  it('sorts oldest first', () => {
    expect(
      trail()
        .sorted()
        .map((entry) => entry.action)
    ).toEqual(['received', 'screened', 'screened', 'responded']);
  });

  it('keeps insertion order for entries at the same minute', () => {
    const log = new AuditTrail([
      { ...ENTRY, action: 'first' },
      { ...ENTRY, action: 'second' },
    ]);
    expect(log.sorted().map((entry) => entry.action)).toEqual(['first', 'second']);
  });

  it('filters by subject and by action', () => {
    expect(trail().forSubject('b240315000420')).toHaveLength(3);
    expect(trail().forAction('RESPONDED')).toHaveLength(1);
    expect(trail().forSubject('nothing')).toEqual([]);
  });

  it('filters by window with both ends included', () => {
    const window = trail().between('2024-03-15T07:45', '2024-03-15T09:00');
    expect(window.map((entry) => entry.action)).toEqual(['received', 'screened', 'screened']);
  });

  it('finds the last entry about a subject', () => {
    expect(trail().latestFor('B240315000420').action).toBe('responded');
    expect(trail().latestFor('nothing')).toBeNull();
  });

  it('renders itself as sorted json', () => {
    expect(trail().toJSON()[0].action).toBe('received');
  });
});

describe('formatEntry', () => {
  it('writes one line', () => {
    expect(formatEntry(auditEntry(ENTRY))).toBe(
      '2024-03-15T08:00 B240315000420 screened by kmartel one gas main in the tolerance zone'
    );
  });

  it('leaves the detail off when there is none', () => {
    expect(formatEntry(auditEntry({ ...ENTRY, detail: null }))).toBe(
      '2024-03-15T08:00 B240315000420 screened by kmartel'
    );
  });
});
