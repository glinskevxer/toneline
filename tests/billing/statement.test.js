import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCE,
  readStatement,
  collapseStatement,
  reconcile,
  disputedTotal,
  reconciliationLines,
} from '../../src/billing/statement.js';
import { BillingError } from '../../src/billing/rates.js';

const INVOICE = {
  period: '2024-03',
  lines: [
    { number: 'B240315000420', amount: 12.5 },
    { number: 'B240315000421', amount: 78.75 },
    { number: 'B240315000422', amount: 12.5 },
  ],
};

describe('readStatement', () => {
  it('reads the contractor columns', () => {
    const text = 'ticket,amount\nB240315000420,12.50\nB240315000421,78.75\n';
    expect(readStatement(text)).toEqual([
      { number: 'B240315000420', amount: 12.5 },
      { number: 'B240315000421', amount: 78.75 },
    ]);
  });

  it('honours different column names', () => {
    const text = 'ticket_no,charge\nB240315000420,12.50\n';
    expect(readStatement(text, { numberColumn: 'ticket_no', amountColumn: 'charge' })).toHaveLength(
      1
    );
  });

  it('rejects a line with no ticket number', () => {
    expect(() => readStatement('ticket,amount\n,12.50\n')).toThrow(BillingError);
  });

  it('rejects an amount that is not a number', () => {
    expect(() => readStatement('ticket,amount\nB1,twelve\n')).toThrow(/must be a number/);
  });

  it('reads an empty statement as nothing', () => {
    expect(readStatement('')).toEqual([]);
  });
});

describe('collapseStatement', () => {
  it('adds a repeated ticket together', () => {
    const totals = collapseStatement([
      { number: 'B1', amount: 10 },
      { number: 'B1', amount: 2.5 },
      { number: 'B2', amount: 4 },
    ]);
    expect(totals.get('B1')).toBe(12.5);
    expect(totals.get('B2')).toBe(4);
  });
});

describe('reconcile', () => {
  it('agrees when the two sides match', () => {
    const result = reconcile(INVOICE, [
      { number: 'B240315000420', amount: 12.5 },
      { number: 'B240315000421', amount: 78.75 },
      { number: 'B240315000422', amount: 12.5 },
    ]);
    expect(result.clean).toBe(true);
    expect(result.agreed).toHaveLength(3);
    expect(result.difference).toBe(0);
  });

  it('queries a line priced differently', () => {
    const result = reconcile(INVOICE, [
      { number: 'B240315000420', amount: 18 },
      { number: 'B240315000421', amount: 78.75 },
      { number: 'B240315000422', amount: 12.5 },
    ]);
    expect(result.queries).toEqual([
      { number: 'B240315000420', ours: 12.5, theirs: 18, difference: 5.5 },
    ]);
    expect(result.clean).toBe(false);
    expect(result.difference).toBe(5.5);
  });

  it('forgives a rounding penny', () => {
    const result = reconcile(INVOICE, [
      { number: 'B240315000420', amount: 12.51 },
      { number: 'B240315000421', amount: 78.75 },
      { number: 'B240315000422', amount: 12.5 },
    ]);
    expect(result.queries).toEqual([]);
    expect(result.agreed).toHaveLength(3);
  });

  it('honours a wider tolerance', () => {
    const result = reconcile(
      INVOICE,
      [
        { number: 'B240315000420', amount: 13 },
        { number: 'B240315000421', amount: 78.75 },
        { number: 'B240315000422', amount: 12.5 },
      ],
      { tolerance: 1 }
    );
    expect(result.queries).toEqual([]);
  });

  it('splits out what only one side has', () => {
    const result = reconcile(INVOICE, [
      { number: 'B240315000420', amount: 12.5 },
      { number: 'B240315000499', amount: 45 },
    ]);
    expect(result.onlyOurs.map((entry) => entry.number)).toEqual([
      'B240315000421',
      'B240315000422',
    ]);
    expect(result.onlyTheirs).toEqual([{ number: 'B240315000499', amount: 45 }]);
  });

  it('adds both sides up', () => {
    const result = reconcile(INVOICE, [{ number: 'B240315000420', amount: 12.5 }]);
    expect(result.ourTotal).toBe(103.75);
    expect(result.theirTotal).toBe(12.5);
    expect(result.difference).toBe(-91.25);
  });

  it('reconciles against an empty statement', () => {
    const result = reconcile(INVOICE, []);
    expect(result.onlyOurs).toHaveLength(3);
    expect(result.clean).toBe(false);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(reconcile(INVOICE, []))).toBe(true);
  });

  it('uses the default tolerance when none was given', () => {
    expect(DEFAULT_TOLERANCE).toBe(0.01);
  });
});

describe('disputedTotal and reconciliationLines', () => {
  const result = reconcile(INVOICE, [
    { number: 'B240315000420', amount: 18 },
    { number: 'B240315000499', amount: 45 },
  ]);

  it('adds up everything at stake', () => {
    expect(disputedTotal(result)).toBe(5.5 + 78.75 + 12.5 + 45);
  });

  it('is nothing on a clean reconciliation', () => {
    const clean = reconcile(INVOICE, INVOICE.lines);
    expect(disputedTotal(clean)).toBe(0);
  });

  it('writes a line per bucket', () => {
    expect(reconciliationLines(result)).toEqual([
      '0 lines agreed',
      '1 lines queried',
      '1 lines we do not have',
      '2 lines they do not have',
    ]);
  });
});
