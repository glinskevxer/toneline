import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CREDIT_TERMS,
  creditTerms,
  creditShareFor,
  buildCreditNote,
  creditsByReason,
  worstCredits,
} from '../../src/billing/credits.js';
import { BillingError } from '../../src/billing/rates.js';

const INVOICE = {
  period: '2024-03',
  subtotal: 200,
  total: 200,
  lines: [
    { number: 'B1', amount: 100 },
    { number: 'B2', amount: 50 },
    { number: 'B3', amount: 50 },
  ],
};

function record(overrides = {}) {
  return {
    number: 'B1',
    status: 'compliant',
    answered: true,
    complete: true,
    minutesLate: -60,
    ...overrides,
  };
}

describe('creditTerms', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_CREDIT_TERMS.lateShare).toBe(0.5);
    expect(creditTerms({ lateShare: 0.25 }).missedShare).toBe(1);
  });

  it('rejects a term that is not a number at or above zero', () => {
    expect(() => creditTerms({ lateShare: -0.1 })).toThrow(BillingError);
    expect(() => creditTerms({ graceMinutes: 'some' })).toThrow(/at or above zero/);
  });

  it('rejects a cap larger than the invoice', () => {
    expect(() => creditTerms({ capShare: 1.5 })).toThrow(/more than the whole invoice/);
    expect(creditTerms({ capShare: 1 }).capShare).toBe(1);
  });
});

describe('creditShareFor', () => {
  it('credits nothing on a compliant ticket', () => {
    expect(creditShareFor(record())).toEqual({ share: 0, reason: null });
  });

  it('credits the whole line on one nobody answered', () => {
    expect(
      creditShareFor(record({ status: 'missed', answered: false, minutesLate: null }))
    ).toEqual({ share: 1, reason: 'never answered' });
  });

  it('credits half on a late answer', () => {
    expect(creditShareFor(record({ status: 'late', minutesLate: 120 }))).toEqual({
      share: 0.5,
      reason: 'answered late',
    });
  });

  it('forgives lateness inside the grace period', () => {
    expect(creditShareFor(record({ status: 'late', minutesLate: 20 })).share).toBe(0);
  });

  it('credits more when it was late and incomplete', () => {
    const share = creditShareFor(
      record({ status: 'late and incomplete', minutesLate: 120, complete: false })
    );
    expect(share).toEqual({ share: 0.75, reason: 'late and incomplete' });
  });

  it('credits a quarter on an answer that only went part way', () => {
    expect(creditShareFor(record({ status: 'incomplete', complete: false }))).toEqual({
      share: 0.25,
      reason: 'answered in part',
    });
  });

  it('never credits more than the whole line', () => {
    const terms = creditTerms({ lateShare: 0.9, incompleteShare: 0.9 });
    expect(creditShareFor(record({ minutesLate: 120, complete: false }), terms).share).toBe(1);
  });
});

describe('buildCreditNote', () => {
  const compliance = [
    record({ number: 'B1', status: 'late', minutesLate: 120 }),
    record({ number: 'B2' }),
    record({ number: 'B3', status: 'missed', answered: false, minutesLate: null }),
  ];

  it('credits only the lines that earned one', () => {
    const note = buildCreditNote(INVOICE, compliance, creditTerms({ capShare: 1 }));
    expect(note.lines.map((line) => line.number)).toEqual(['B1', 'B3']);
    expect(note.lines[0].amount).toBe(50);
    expect(note.lines[1].amount).toBe(50);
  });

  it('caps the credit as a share of the invoice', () => {
    const note = buildCreditNote(INVOICE, compliance);
    expect(note.raw).toBe(100);
    expect(note.cap).toBe(40);
    expect(note.applied).toBe(40);
    expect(note.capped).toBe(true);
    expect(note.payable).toBe(160);
  });

  it('applies the whole credit when it fits under the cap', () => {
    const note = buildCreditNote(INVOICE, [compliance[0]], creditTerms({ capShare: 1 }));
    expect(note.applied).toBe(50);
    expect(note.capped).toBe(false);
    expect(note.payable).toBe(150);
  });

  it('ignores a compliance record with no invoice line', () => {
    const note = buildCreditNote(INVOICE, [record({ number: 'B9', status: 'missed' })]);
    expect(note.lines).toEqual([]);
    expect(note.applied).toBe(0);
  });

  it('credits nothing on a clean month', () => {
    const note = buildCreditNote(INVOICE, [record(), record({ number: 'B2' })]);
    expect(note.raw).toBe(0);
    expect(note.payable).toBe(200);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(buildCreditNote(INVOICE, compliance))).toBe(true);
  });
});

describe('credit views', () => {
  const note = buildCreditNote(
    INVOICE,
    [
      record({ number: 'B1', status: 'late', minutesLate: 120 }),
      record({ number: 'B3', status: 'missed', answered: false, minutesLate: null }),
    ],
    creditTerms({ capShare: 1 })
  );

  it('splits the credit by reason', () => {
    expect(creditsByReason(note)).toEqual({ 'answered late': 50, 'never answered': 50 });
  });

  it('ranks the worst tickets', () => {
    expect(worstCredits(note, 1).map((line) => line.number)).toEqual(['B1']);
    expect(worstCredits(note)).toHaveLength(2);
    expect(worstCredits(note, 0)).toEqual([]);
  });
});
