import { describe, expect, it } from 'vitest';
import {
  isWeekendStamp,
  isAfterHours,
  billingMonth,
  invoiceLine,
  buildInvoice,
  invoiceByType,
  premiumLines,
} from '../../src/billing/invoice.js';
import { buildRates, BillingError } from '../../src/billing/rates.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildResponse } from '../../src/response/post.js';

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

function posting(number, at, overrides = {}) {
  return buildResponse({
    number,
    code: '2',
    at,
    by: 'loc-1',
    marksThrough: '2024-03-29',
    ...overrides,
  });
}

const schedule = buildRates();

describe('isWeekendStamp and isAfterHours', () => {
  it('finds the weekend', () => {
    expect(isWeekendStamp('2024-03-16T09:00')).toBe(true);
    expect(isWeekendStamp('2024-03-17T09:00')).toBe(true);
    expect(isWeekendStamp('2024-03-18T09:00')).toBe(false);
  });

  it('finds work outside the contracted day', () => {
    expect(isAfterHours('2024-03-18T06:59')).toBe(true);
    expect(isAfterHours('2024-03-18T07:00')).toBe(false);
    expect(isAfterHours('2024-03-18T16:59')).toBe(false);
    expect(isAfterHours('2024-03-18T17:00')).toBe(true);
  });

  it('honours a different contracted day', () => {
    expect(isAfterHours('2024-03-18T06:30', { dayStart: '06:00', dayEnd: '18:00' })).toBe(false);
  });
});

describe('billingMonth', () => {
  it('is the month of the first posting', () => {
    const responses = [
      posting('B240315000420', '2024-04-02T09:00'),
      posting('B240315000420', '2024-03-30T09:00'),
    ];
    expect(billingMonth(ticket(), responses)).toBe('2024-03');
  });

  it('is nothing when the ticket was never answered', () => {
    expect(billingMonth(ticket(), [])).toBeNull();
  });
});

describe('invoiceLine', () => {
  it('prices an ordinary ticket', () => {
    const line = invoiceLine(ticket(), '2024-03-18T09:00', schedule);
    expect(line.amount).toBe(12.5);
    expect(line.weekend).toBe(false);
    expect(line.afterHours).toBe(false);
    expect(Object.isFrozen(line)).toBe(true);
  });

  it('reads the footage out of the extent', () => {
    const line = invoiceLine(ticket({ extent: 'east 700 feet' }), '2024-03-18T09:00', schedule);
    expect(line.footage).toBe(700);
    expect(line.footageCharge).toBe(24);
    expect(line.amount).toBe(36.5);
  });

  it('carries the weekend premium', () => {
    const line = invoiceLine(ticket(), '2024-03-16T09:00', schedule);
    expect(line.multiplier).toBe(1.75);
    expect(line.amount).toBe(21.88);
  });

  it('carries the after hours premium', () => {
    const line = invoiceLine(ticket(), '2024-03-18T19:00', schedule);
    expect(line.multiplier).toBe(1.5);
    expect(line.amount).toBe(18.75);
  });
});

describe('buildInvoice', () => {
  const tickets = [
    ticket(),
    ticket({ number: 'B240315000421', type: 'EMERGENCY' }),
    ticket({ number: 'B240315000422' }),
    ticket({ number: 'B240315000423' }),
  ];
  const responses = [
    posting('B240315000420', '2024-03-18T09:00'),
    posting('B240315000421', '2024-03-16T22:00'),
    posting('B240315000422', '2024-04-02T09:00'),
  ];

  it('bills only what was answered in the month', () => {
    const invoice = buildInvoice({ period: '2024-03', tickets, responses, rates: schedule });
    expect(invoice.lines.map((line) => line.number)).toEqual(['B240315000421', 'B240315000420']);
    expect(invoice.tickets).toBe(2);
  });

  it('says why it skipped the rest', () => {
    const invoice = buildInvoice({ period: '2024-03', tickets, responses, rates: schedule });
    expect(invoice.skipped).toEqual([
      { number: 'B240315000422', reason: 'answered in another month' },
      { number: 'B240315000423', reason: 'never answered' },
    ]);
  });

  it('adds the lines up', () => {
    const invoice = buildInvoice({ period: '2024-03', tickets, responses, rates: schedule });
    expect(invoice.subtotal).toBe(78.75 + 12.5);
    expect(invoice.minimumTopUp).toBe(0);
    expect(invoice.total).toBe(91.25);
  });

  it('tops the invoice up to the monthly minimum', () => {
    const withMinimum = buildRates({ minimumMonthly: 500 });
    const invoice = buildInvoice({ period: '2024-03', tickets, responses, rates: withMinimum });
    expect(invoice.minimumTopUp).toBe(408.75);
    expect(invoice.total).toBe(500);
  });

  it('builds its own schedule when none was handed in', () => {
    const invoice = buildInvoice({ period: '2024-03', tickets, responses });
    expect(invoice.total).toBe(91.25);
  });

  it('bills an empty month at nothing', () => {
    const invoice = buildInvoice({ period: '2024-05', tickets, responses, rates: schedule });
    expect(invoice.lines).toEqual([]);
    expect(invoice.total).toBe(0);
  });

  it('rejects a period that is not a month', () => {
    expect(() => buildInvoice({ period: '2024-03-01', tickets, responses })).toThrow(BillingError);
    expect(() => buildInvoice({ period: '', tickets, responses })).toThrow(/period is required/);
  });
});

describe('invoice views', () => {
  const invoice = buildInvoice({
    period: '2024-03',
    tickets: [ticket(), ticket({ number: 'B240315000421', type: 'EMERGENCY' })],
    responses: [
      posting('B240315000420', '2024-03-18T09:00'),
      posting('B240315000421', '2024-03-16T22:00'),
    ],
    rates: schedule,
  });

  it('splits the total by type', () => {
    expect(invoiceByType(invoice)).toEqual({ NORMAL: 12.5, EMERGENCY: 78.75 });
  });

  it('names the lines carrying a premium', () => {
    expect(premiumLines(invoice).map((line) => line.number)).toEqual(['B240315000421']);
  });
});
