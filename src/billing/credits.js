/**
 * Service credits.
 *
 * The locating contract prices the work and then takes some of it back when the
 * work was late. Credits are worked out per ticket from the compliance record,
 * capped as a share of the invoice so a bad month cannot end with the operator
 * owing the contractor nothing at all, and applied as their own lines so the
 * invoice still shows what was done.
 */

import { deepFreeze } from '../core/fields.js';
import { atOrAboveZero, definePolicy, share } from '../config/policies.js';

/** The credit terms this desk works to. */
export const DEFAULT_CREDIT_TERMS = Object.freeze({
  lateShare: 0.5,
  missedShare: 1,
  incompleteShare: 0.25,
  graceMinutes: 30,
  capShare: 0.2,
});

/** Merge partial credit terms over the defaults. */
export const creditTerms = definePolicy(DEFAULT_CREDIT_TERMS, {
  lateShare: atOrAboveZero,
  missedShare: atOrAboveZero,
  incompleteShare: atOrAboveZero,
  graceMinutes: atOrAboveZero,
  capShare: share,
});

/**
 * The share of a line that is credited back for one compliance record.
 *
 * @returns {{share: number, reason: string|null}}
 */
export function creditShareFor(record, terms = DEFAULT_CREDIT_TERMS) {
  if (record.status === 'missed') return { share: terms.missedShare, reason: 'never answered' };
  if (record.minutesLate !== null && record.minutesLate > terms.graceMinutes) {
    if (!record.complete) {
      return {
        share: Math.min(1, terms.lateShare + terms.incompleteShare),
        reason: 'late and incomplete',
      };
    }
    return { share: terms.lateShare, reason: 'answered late' };
  }
  if (!record.complete && record.answered) {
    return { share: terms.incompleteShare, reason: 'answered in part' };
  }
  return { share: 0, reason: null };
}

/**
 * Work the credits out for a whole invoice.
 *
 * @param {object} invoice the invoice as billed
 * @param {object[]} compliance the compliance records for the same tickets
 * @param {object} [terms] the credit terms
 * @returns {object} a frozen credit note
 */
export function buildCreditNote(invoice, compliance, terms = DEFAULT_CREDIT_TERMS) {
  const byNumber = new Map(compliance.map((record) => [record.number, record]));
  const lines = [];
  for (const line of invoice.lines) {
    const record = byNumber.get(line.number);
    if (record === undefined) continue;
    const { share, reason } = creditShareFor(record, terms);
    if (share <= 0) continue;
    lines.push({
      number: line.number,
      billed: line.amount,
      share,
      reason,
      amount: round(line.amount * share),
    });
  }
  const raw = round(lines.reduce((sum, line) => sum + line.amount, 0));
  const cap = round(invoice.subtotal * terms.capShare);
  const applied = Math.min(raw, cap);
  return deepFreeze({
    period: invoice.period,
    lines,
    raw,
    cap,
    applied: round(applied),
    capped: raw > cap,
    payable: round(invoice.total - applied),
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** The credit note split by the reason it was earned. */
export function creditsByReason(note) {
  const totals = {};
  for (const line of note.lines) {
    totals[line.reason] = round((totals[line.reason] ?? 0) + line.amount);
  }
  return totals;
}

/** The tickets that cost the contractor the most, worst first. */
export function worstCredits(note, limit = 5) {
  return [...note.lines]
    .sort((left, right) => right.amount - left.amount || left.number.localeCompare(right.number))
    .slice(0, Math.max(0, limit));
}
