import { describe, expect, it } from 'vitest';
import {
  GENESIS,
  digestInput,
  digestFor,
  chain,
  chainHead,
  verifyChain,
  sealTrail,
} from '../../src/audit/chain.js';
import { AuditTrail, auditEntry } from '../../src/audit/trail.js';

function entry(overrides = {}) {
  return auditEntry({
    at: '2024-03-15T08:00',
    subject: 'B240315000420',
    action: 'screened',
    by: 'kmartel',
    ...overrides,
  });
}

const ENTRIES = [
  entry({ at: '2024-03-15T07:45', action: 'received', by: 'feed' }),
  entry(),
  entry({ at: '2024-03-16T09:40', action: 'responded', by: 'loc-14' }),
];

describe('digestFor', () => {
  it('gives the same digest for the same entry and link', () => {
    expect(digestFor(entry())).toBe(digestFor(entry()));
  });

  it('changes when anything in the entry changes', () => {
    expect(digestFor(entry({ by: 'somebody else' }))).not.toBe(digestFor(entry()));
    expect(digestFor(entry({ detail: 'x' }))).not.toBe(digestFor(entry()));
    expect(digestFor(entry({ data: { hits: 1 } }))).not.toBe(digestFor(entry()));
  });

  it('changes when the link before it changes', () => {
    const other = 'a'.repeat(64);
    expect(digestFor(entry(), GENESIS)).not.toBe(digestFor(entry(), other));
  });

  it('writes a sixty four character digest', () => {
    expect(digestFor(entry())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separates the fields so two of them cannot be run together', () => {
    const shifted = digestInput(entry({ action: 'screenedkmartel', by: 'x' }), GENESIS);
    expect(shifted).not.toBe(digestInput(entry({ by: 'x' }), GENESIS));
    expect(digestInput(entry(), GENESIS)).toContain(' | ');
  });
});

describe('chain', () => {
  it('links each entry to the one before it', () => {
    const links = chain(ENTRIES);
    expect(links).toHaveLength(3);
    expect(links[0].previous).toBe(GENESIS);
    expect(links[1].previous).toBe(links[0].digest);
    expect(links[2].previous).toBe(links[1].digest);
  });

  it('chains nothing from nothing', () => {
    expect(chain([])).toEqual([]);
    expect(chainHead([])).toBe(GENESIS);
  });

  it('gives the whole trail one head digest', () => {
    expect(chainHead(ENTRIES)).toBe(chain(ENTRIES)[2].digest);
  });

  it('changes the head when any entry changes', () => {
    const changed = [ENTRIES[0], entry({ by: 'somebody else' }), ENTRIES[2]];
    expect(chainHead(changed)).not.toBe(chainHead(ENTRIES));
  });

  it('changes the head when the order changes', () => {
    expect(chainHead([ENTRIES[1], ENTRIES[0], ENTRIES[2]])).not.toBe(chainHead(ENTRIES));
  });
});

describe('verifyChain', () => {
  it('passes a chain it wrote itself', () => {
    expect(verifyChain(chain(ENTRIES))).toEqual({ sound: true, brokenAt: null, reason: null });
  });

  it('passes an empty chain', () => {
    expect(verifyChain([]).sound).toBe(true);
  });

  it('catches an entry that was edited after the fact', () => {
    const links = chain(ENTRIES);
    links[1] = { ...links[1], entry: entry({ by: 'somebody else' }) };
    const result = verifyChain(links);
    expect(result.sound).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toMatch(/does not match its digest/);
  });

  it('catches an entry that was dropped out of the middle', () => {
    const links = chain(ENTRIES);
    const result = verifyChain([links[0], links[2]]);
    expect(result.sound).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toMatch(/does not follow/);
  });

  it('catches a chain that does not start at the beginning', () => {
    expect(verifyChain(chain(ENTRIES).slice(1)).brokenAt).toBe(0);
  });
});

describe('sealTrail', () => {
  it('seals a trail and counts what went into it', () => {
    const sealed = sealTrail(new AuditTrail(ENTRIES));
    expect(sealed.entries).toBe(3);
    expect(sealed.head).toMatch(/^[0-9a-f]{64}$/);
  });

  it('seals the trail in time order, not insertion order', () => {
    const forwards = new AuditTrail([ENTRIES[0], ENTRIES[1], ENTRIES[2]]);
    const backwards = new AuditTrail([ENTRIES[2], ENTRIES[1], ENTRIES[0]]);
    expect(sealTrail(backwards).head).toBe(sealTrail(forwards).head);
  });

  it('seals an empty trail to the genesis digest', () => {
    expect(sealTrail(new AuditTrail()).head).toBe(GENESIS);
  });
});
