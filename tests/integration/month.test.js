import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDesk, readFeed } from '../../src/cli/context.js';
import { schedulingContext } from '../../src/config/load.js';
import { answerBatch } from '../../src/response/session.js';
import { evaluateBatch } from '../../src/response/compliance.js';
import { buildInvoice } from '../../src/billing/invoice.js';
import { buildCreditNote } from '../../src/billing/credits.js';
import { closePeriod, billingPeriodFor, lockPeriod } from '../../src/billing/period.js';
import { reconcile, disputedTotal } from '../../src/billing/statement.js';
import { monthlyPack, packHeadlines } from '../../src/reporting/monthly.js';
import { readDamageCsv } from '../../src/io/damages.js';
import { readText } from '../../src/io/files.js';
import { buildCostSheet, buildClaim } from '../../src/damage/cost.js';
import { buildDamageRegister, registerTotals } from '../../src/damage/register.js';
import { noticesFor } from '../../src/damage/notice.js';
import { trend, trendLine } from '../../src/reporting/trend.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const desk = openDesk(join(examples, 'cross-timbers.json')).desk;
const tickets = readFeed(join(examples, 'march-2024.feed')).tickets;
const damages = readDamageCsv(readText(join(examples, 'damages-2024.csv'))).damages;

const session = answerBatch(tickets, { desk, at: '2024-03-20T08:00', by: 'desk' });
const compliance = evaluateBatch(
  tickets.map((ticket, index) => ({
    ticket,
    responses: session.postings,
    screening: session.screenings[index],
  })),
  { at: '2024-03-25T08:00', ...schedulingContext(desk) }
);
const invoice = buildInvoice({ period: '2024-03', tickets, responses: session.postings });

describe('closing the month', () => {
  it('invoices what was answered in it', () => {
    expect(invoice.lines).toHaveLength(4);
    expect(invoice.total).toBeGreaterThan(0);
  });

  it('credits back what ran late', () => {
    const credits = buildCreditNote(invoice, compliance);
    expect(credits.payable).toBeLessThanOrEqual(invoice.total);
    expect(credits.period).toBe('2024-03');
  });

  it('closes the period with what it was closed on', () => {
    const credits = buildCreditNote(invoice, compliance);
    const closed = closePeriod({
      period: '2024-03',
      closedOn: '2024-04-05',
      closedBy: 'finance',
      invoice,
      credits,
    });
    expect(closed.state).toBe('closed');
    expect(closed.tickets).toBe(4);
    expect(closed.payable).toBe(credits.payable);
  });

  it('pushes a late posting into the next open month', () => {
    const closed = closePeriod({
      period: '2024-03',
      closedOn: '2024-04-05',
      closedBy: 'finance',
      invoice,
    });
    const late = { number: 'B240313000418', at: '2024-03-31T16:00' };
    expect(billingPeriodFor(late, [closed])).toEqual({
      period: '2024-04',
      late: true,
      from: '2024-03',
    });
  });

  it('will not let a locked period be locked again', () => {
    const closed = closePeriod({
      period: '2024-03',
      closedOn: '2024-04-05',
      closedBy: 'finance',
      invoice,
    });
    const locked = lockPeriod(closed, { lockedOn: '2024-04-30', lockedBy: 'finance' });
    expect(() => lockPeriod(locked, { lockedOn: '2024-05-01', lockedBy: 'f' })).toThrow();
  });
});

describe('agreeing with the contractor', () => {
  it('reconciles cleanly when the two sides match', () => {
    const statement = invoice.lines.map((line) => ({ number: line.number, amount: line.amount }));
    const result = reconcile(invoice, statement);
    expect(result.clean).toBe(true);
    expect(disputedTotal(result)).toBe(0);
  });

  it('queries a line the contractor priced differently', () => {
    const statement = invoice.lines.map((line, index) => ({
      number: line.number,
      amount: index === 0 ? line.amount + 25 : line.amount,
    }));
    const result = reconcile(invoice, statement);
    expect(result.queries).toHaveLength(1);
    expect(result.difference).toBe(25);
    expect(disputedTotal(result)).toBe(25);
  });

  it('names a line only the contractor has', () => {
    const statement = [
      ...invoice.lines.map((line) => ({ number: line.number, amount: line.amount })),
      { number: 'B240399999999', amount: 40 },
    ];
    expect(reconcile(invoice, statement).onlyTheirs).toHaveLength(1);
  });
});

describe('the damages in the month', () => {
  const inMarch = damages.filter((damage) => damage.at.startsWith('2024-03'));

  it('registers them with their cost', () => {
    const entries = inMarch.map((damage) => ({
      damage,
      sheet: buildCostSheet(damage, [
        { kind: 'labour', description: 'repair crew', quantity: 8, rate: 64.5 },
      ]),
    }));
    const rows = buildDamageRegister(entries);
    expect(rows).toHaveLength(1);
    expect(registerTotals(rows).cost).toBe(516);
  });

  it('claims what can be claimed and no more', () => {
    for (const damage of inMarch) {
      const sheet = buildCostSheet(damage, [
        { kind: 'labour', description: 'repair crew', quantity: 8, rate: 64.5 },
        { kind: 'customer_credit', description: 'customers off supply', quantity: 12, rate: 25 },
      ]);
      if (!sheet.recoverable) continue;
      const claim = buildClaim(sheet, { raisedOn: '2024-03-25', reference: 'clm-1' });
      expect(claim.amount).toBe(516);
    }
  });

  it('writes the notices that are owed', () => {
    for (const damage of inMarch) {
      const notices = noticesFor(damage, { operator: 'CTG01' });
      expect(notices.owed).toContain('CENTRE');
      expect(notices.notices.EXCAVATOR).toContain('damage notice');
    }
  });
});

describe('the pack and the trend', () => {
  const march = monthlyPack({
    period: '2024-03',
    desk,
    tickets,
    responses: session.postings,
    compliance,
    damages,
  });
  const april = monthlyPack({
    period: '2024-04',
    desk,
    tickets,
    responses: session.postings,
    compliance,
    damages,
  });

  it('packs both months', () => {
    expect(march.tickets).toBe(4);
    expect(april.tickets).toBe(0);
  });

  it('trends the two months together', () => {
    const result = trend(
      [
        { period: march.period, tickets: march.tickets },
        { period: april.period, tickets: april.tickets },
      ],
      'tickets'
    );
    expect(result.direction).toBe('falling');
    expect(trendLine(result)).toBe('tickets: 4 to 0, falling -4 a period');
  });

  it('carries the headline numbers', () => {
    const headlines = packHeadlines(march);
    expect(headlines.tickets).toBe(4);
    expect(headlines.damages).toBe(1);
    expect(headlines.payable).toBeGreaterThan(0);
  });
});
