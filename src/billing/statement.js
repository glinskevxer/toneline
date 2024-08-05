/**
 * Reconciling the contractor statement.
 *
 * The locating contractor sends its own statement every month and it never
 * agrees with ours exactly. The reconciliation puts the two side by side and
 * splits the difference into four buckets, because each one goes to a different
 * person: a mismatch is a query, a line only they have is a challenge, a line
 * only we have is an omission, and the rest is agreed.
 */

import { deepFreeze, normaliseCode, requireNumber } from '../core/fields.js';
import { parseCsv } from '../io/csv.js';
import { BillingError } from './rates.js';

/** How far apart two amounts may be and still count as agreeing. */
export const DEFAULT_TOLERANCE = 0.01;

/** Read a contractor statement out of csv. */
export function readStatement(text, options = {}) {
  const { numberColumn = 'ticket', amountColumn = 'amount' } = options;
  const rows = parseCsv(text);
  const lines = [];
  rows.forEach((row, index) => {
    const number = normaliseCode(row[numberColumn]);
    if (number === '') {
      throw new BillingError('a statement line has no ticket number', { row: index + 2 });
    }
    lines.push({ number, amount: requireNumber(row[amountColumn], amountColumn) });
  });
  return lines;
}

/** Add a statement's lines together, keeping a repeated ticket as one entry. */
export function collapseStatement(lines) {
  const totals = new Map();
  for (const line of lines) {
    totals.set(line.number, round((totals.get(line.number) ?? 0) + line.amount));
  }
  return totals;
}

/**
 * Compare our invoice against their statement.
 *
 * @param {object} invoice the invoice we built
 * @param {Array<{number: string, amount: number}>} statement their lines
 * @param {object} [options]
 * @param {number} [options.tolerance] how far apart two amounts may be
 * @returns {object} a frozen reconciliation
 */
export function reconcile(invoice, statement, options = {}) {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const theirs = collapseStatement(statement);
  const ours = new Map(invoice.lines.map((line) => [line.number, line.amount]));

  const agreed = [];
  const queries = [];
  const onlyOurs = [];
  const onlyTheirs = [];

  for (const [number, amount] of ours) {
    if (!theirs.has(number)) {
      onlyOurs.push({ number, amount });
      continue;
    }
    const theirAmount = theirs.get(number);
    const difference = round(theirAmount - amount);
    if (Math.abs(difference) <= tolerance) {
      agreed.push({ number, amount });
    } else {
      queries.push({ number, ours: amount, theirs: theirAmount, difference });
    }
  }
  for (const [number, amount] of theirs) {
    if (!ours.has(number)) onlyTheirs.push({ number, amount });
  }

  const sortByNumber = (left, right) => left.number.localeCompare(right.number);
  agreed.sort(sortByNumber);
  queries.sort(sortByNumber);
  onlyOurs.sort(sortByNumber);
  onlyTheirs.sort(sortByNumber);

  const ourTotal = round(invoice.lines.reduce((sum, line) => sum + line.amount, 0));
  const theirTotal = round([...theirs.values()].reduce((sum, amount) => sum + amount, 0));

  return deepFreeze({
    period: invoice.period,
    agreed,
    queries,
    onlyOurs,
    onlyTheirs,
    ourTotal,
    theirTotal,
    difference: round(theirTotal - ourTotal),
    clean: queries.length === 0 && onlyOurs.length === 0 && onlyTheirs.length === 0,
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** The money at stake in everything that did not agree. */
export function disputedTotal(reconciliation) {
  const queries = reconciliation.queries.reduce(
    (sum, entry) => sum + Math.abs(entry.difference),
    0
  );
  const missing = reconciliation.onlyOurs.reduce((sum, entry) => sum + entry.amount, 0);
  const extra = reconciliation.onlyTheirs.reduce((sum, entry) => sum + entry.amount, 0);
  return round(queries + missing + extra);
}

/** A short line per bucket for the covering note. */
export function reconciliationLines(reconciliation) {
  return [
    `${reconciliation.agreed.length} lines agreed`,
    `${reconciliation.queries.length} lines queried`,
    `${reconciliation.onlyTheirs.length} lines we do not have`,
    `${reconciliation.onlyOurs.length} lines they do not have`,
  ];
}
