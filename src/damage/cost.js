/**
 * What a damage cost.
 *
 * The cost sheet is built line by line so the claim can show its working. Lines
 * are kept in the order they were added, money is held in whole cents to keep
 * the arithmetic exact, and the recoverable total is separate from the total
 * because a locating failure is ours to absorb.
 */

import { deepFreeze, requireNonNegative, requireString } from '../core/fields.js';
import { DamageError } from './report.js';
import { classifyDamage } from './rootCause.js';

/** The kinds of line a cost sheet carries. */
export const COST_KINDS = Object.freeze([
  'LABOUR',
  'EQUIPMENT',
  'MATERIAL',
  'CONTRACTOR',
  'LOST_PRODUCT',
  'CUSTOMER_CREDIT',
  'ADMIN',
]);

/** Turn an amount in dollars into whole cents. */
export function toCents(amount) {
  const number = requireNonNegative(amount, 'amount');
  return Math.round(number * 100);
}

/** Turn whole cents back into a dollar amount rounded to two places. */
export function toDollars(cents) {
  return Math.round(cents) / 100;
}

/** Build one cost line. */
export function costLine(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DamageError('a cost line must be built from an object', { type: typeof raw });
  }
  const kind = requireString(raw.kind, 'kind').toUpperCase();
  if (!COST_KINDS.includes(kind)) {
    throw new DamageError('that is not a cost line we keep', { kind, known: COST_KINDS });
  }
  const quantity = raw.quantity === undefined ? 1 : requireNonNegative(raw.quantity, 'quantity');
  const rate = requireNonNegative(raw.rate, 'rate');
  return deepFreeze({
    kind,
    description: requireString(raw.description, 'description'),
    quantity,
    unit: raw.unit === undefined || raw.unit === null ? 'each' : requireString(raw.unit, 'unit'),
    rateCents: toCents(rate),
    amountCents: Math.round(toCents(rate) * quantity),
  });
}

/** Build a whole cost sheet for a damage. */
export function buildCostSheet(damage, lines) {
  const built = (lines ?? []).map(costLine);
  const verdict = classifyDamage(damage);
  const totalCents = built.reduce((sum, line) => sum + line.amountCents, 0);
  return deepFreeze({
    damageId: damage.id,
    lines: built,
    totalCents,
    total: toDollars(totalCents),
    recoverable: verdict.recoverable,
    recoverableCents: verdict.recoverable ? totalCents : 0,
    responsible: verdict.responsible,
    cause: verdict.code,
  });
}

/** The sheet total split by line kind. */
export function totalsByKind(sheet) {
  const totals = {};
  for (const line of sheet.lines) {
    totals[line.kind] = (totals[line.kind] ?? 0) + line.amountCents;
  }
  return totals;
}

/**
 * Build the claim to send to the excavator.
 *
 * A claim is only raised on a recoverable damage, and customer credits are left
 * off because the operator owes those to its own customers whatever happened.
 */
export function buildClaim(sheet, { raisedOn, reference }) {
  if (!sheet.recoverable) {
    throw new DamageError('this damage is not recoverable from the excavator', {
      damageId: sheet.damageId,
      cause: sheet.cause,
    });
  }
  const claimable = sheet.lines.filter((line) => line.kind !== 'CUSTOMER_CREDIT');
  const amountCents = claimable.reduce((sum, line) => sum + line.amountCents, 0);
  if (amountCents === 0) {
    throw new DamageError('there is nothing to claim', { damageId: sheet.damageId });
  }
  return deepFreeze({
    reference: requireString(reference, 'reference').toUpperCase(),
    damageId: sheet.damageId,
    raisedOn: requireString(raisedOn, 'raisedOn'),
    lines: claimable,
    amountCents,
    amount: toDollars(amountCents),
  });
}

/** Add several sheets up for a period report. */
export function sheetTotals(sheets) {
  const totalCents = sheets.reduce((sum, sheet) => sum + sheet.totalCents, 0);
  const recoverableCents = sheets.reduce((sum, sheet) => sum + sheet.recoverableCents, 0);
  return deepFreeze({
    sheets: sheets.length,
    totalCents,
    total: toDollars(totalCents),
    recoverableCents,
    recoverable: toDollars(recoverableCents),
    absorbedCents: totalCents - recoverableCents,
    absorbed: toDollars(totalCents - recoverableCents),
  });
}
