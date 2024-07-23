import { describe, expect, it } from 'vitest';
import {
  COST_KINDS,
  toCents,
  toDollars,
  costLine,
  buildCostSheet,
  totalsByKind,
  buildClaim,
  sheetTotals,
} from '../../src/damage/cost.js';
import { DamageError, buildDamage } from '../../src/damage/report.js';

function damage(overrides = {}) {
  return buildDamage({
    id: 'dmg-1',
    at: '2024-03-19T10:25',
    ticketNumber: 'B240315000420',
    facilityType: 'gas',
    method: 'backhoe',
    marksPresent: 'Y',
    marksAccurate: 'Y',
    ticketValid: 'Y',
    reportedBy: 'loc-14',
    ...overrides,
  });
}

const LINES = [
  { kind: 'labour', description: 'two fitters, four hours', quantity: 8, unit: 'hour', rate: 64.5 },
  { kind: 'material', description: 'service tee and fittings', rate: 212.4 },
  { kind: 'customer_credit', description: 'twelve customers off supply', quantity: 12, rate: 25 },
];

describe('money helpers', () => {
  it('rounds dollars into cents', () => {
    expect(toCents(64.5)).toBe(6450);
    expect(toCents('212.405')).toBe(21241);
    expect(toCents(0)).toBe(0);
  });

  it('rejects a negative amount', () => {
    expect(() => toCents(-1)).toThrow(/cannot be negative/);
  });

  it('turns cents back into dollars', () => {
    expect(toDollars(21241)).toBe(212.41);
    expect(toDollars(0)).toBe(0);
  });
});

describe('costLine', () => {
  it('multiplies the rate by the quantity', () => {
    const line = costLine(LINES[0]);
    expect(line.kind).toBe('LABOUR');
    expect(line.rateCents).toBe(6450);
    expect(line.amountCents).toBe(51600);
    expect(Object.isFrozen(line)).toBe(true);
  });

  it('defaults the quantity and the unit', () => {
    const line = costLine(LINES[1]);
    expect(line.quantity).toBe(1);
    expect(line.unit).toBe('each');
    expect(line.amountCents).toBe(21240);
  });

  it('rejects anything that is not an object', () => {
    expect(() => costLine(null)).toThrow(DamageError);
  });

  it('rejects a kind we do not keep', () => {
    try {
      costLine({ kind: 'goodwill', description: 'x', rate: 1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.known).toEqual(COST_KINDS);
    }
  });

  it('rejects a missing description or a bad rate', () => {
    expect(() => costLine({ kind: 'labour', rate: 1 })).toThrow(/description is required/);
    expect(() => costLine({ kind: 'labour', description: 'x', rate: -1 })).toThrow(/negative/);
    expect(() => costLine({ kind: 'labour', description: 'x' })).toThrow(/rate is required/);
  });
});

describe('buildCostSheet', () => {
  it('adds the lines up', () => {
    const sheet = buildCostSheet(damage(), LINES);
    expect(sheet.totalCents).toBe(51600 + 21240 + 30000);
    expect(sheet.total).toBe(1028.4);
    expect(sheet.lines).toHaveLength(3);
  });

  it('carries the root cause and the recoverability', () => {
    const sheet = buildCostSheet(damage(), LINES);
    expect(sheet.cause).toBe('EXCAVATION');
    expect(sheet.recoverable).toBe(true);
    expect(sheet.recoverableCents).toBe(sheet.totalCents);
  });

  it('recovers nothing on a locating failure', () => {
    const sheet = buildCostSheet(damage({ marksPresent: 'N', marksAccurate: 'N' }), LINES);
    expect(sheet.recoverable).toBe(false);
    expect(sheet.recoverableCents).toBe(0);
    expect(sheet.totalCents).toBeGreaterThan(0);
  });

  it('builds an empty sheet', () => {
    const sheet = buildCostSheet(damage(), []);
    expect(sheet.totalCents).toBe(0);
    expect(buildCostSheet(damage()).lines).toEqual([]);
  });

  it('splits the total by kind', () => {
    expect(totalsByKind(buildCostSheet(damage(), LINES))).toEqual({
      LABOUR: 51600,
      MATERIAL: 21240,
      CUSTOMER_CREDIT: 30000,
    });
  });
});

describe('buildClaim', () => {
  it('leaves customer credits off the claim', () => {
    const claim = buildClaim(buildCostSheet(damage(), LINES), {
      raisedOn: '2024-03-25',
      reference: 'clm-2024-004',
    });
    expect(claim.reference).toBe('CLM-2024-004');
    expect(claim.lines).toHaveLength(2);
    expect(claim.amountCents).toBe(51600 + 21240);
    expect(claim.amount).toBe(728.4);
  });

  it('refuses to claim on a locating failure', () => {
    const sheet = buildCostSheet(damage({ marksPresent: 'N', marksAccurate: 'N' }), LINES);
    expect(() => buildClaim(sheet, { raisedOn: '2024-03-25', reference: 'c1' })).toThrow(
      /not recoverable/
    );
  });

  it('refuses to claim nothing', () => {
    const sheet = buildCostSheet(damage(), [LINES[2]]);
    expect(() => buildClaim(sheet, { raisedOn: '2024-03-25', reference: 'c1' })).toThrow(
      /nothing to claim/
    );
  });

  it('demands a reference', () => {
    const sheet = buildCostSheet(damage(), LINES);
    expect(() => buildClaim(sheet, { raisedOn: '2024-03-25', reference: '' })).toThrow(
      /reference is required/
    );
  });
});

describe('sheetTotals', () => {
  it('splits what was recovered from what was absorbed', () => {
    const sheets = [
      buildCostSheet(damage(), LINES),
      buildCostSheet(damage({ id: 'dmg-2', marksPresent: 'N', marksAccurate: 'N' }), LINES),
    ];
    const totals = sheetTotals(sheets);
    expect(totals.sheets).toBe(2);
    expect(totals.totalCents).toBe(2 * 102840);
    expect(totals.recoverableCents).toBe(102840);
    expect(totals.absorbed).toBe(1028.4);
  });

  it('totals nothing', () => {
    expect(sheetTotals([]).total).toBe(0);
  });
});
