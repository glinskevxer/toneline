import { describe, expect, it } from 'vitest';
import {
  PERIOD_STATES,
  periodOf,
  nextPeriod,
  periodFor,
  closePeriod,
  lockPeriod,
  stateOf,
  billingPeriodFor,
  isOpen,
  closedPeriods,
  periodState,
} from '../../src/billing/period.js';
import { BillingError } from '../../src/billing/rates.js';

const INVOICE = { period: '2024-03', total: 500, lines: [{ number: 'B1' }, { number: 'B2' }] };
const CREDITS = { applied: 40, payable: 460 };

function closed(overrides = {}) {
  return closePeriod({
    period: '2024-03',
    closedOn: '2024-04-05',
    closedBy: 'kmartel',
    invoice: INVOICE,
    ...overrides,
  });
}

describe('the period label', () => {
  it('accepts a month and rejects anything else', () => {
    expect(periodOf('2024-03')).toBe('2024-03');
    expect(() => periodOf('2024-03-01')).toThrow(BillingError);
    expect(() => periodOf('')).toThrow(/period is required/);
  });

  it('finds the month after', () => {
    expect(nextPeriod('2024-03')).toBe('2024-04');
    expect(nextPeriod('2024-09')).toBe('2024-10');
    expect(nextPeriod('2024-12')).toBe('2025-01');
  });

  it('finds the month a timestamp falls in', () => {
    expect(periodFor('2024-03-15T09:00')).toBe('2024-03');
  });

  it('normalises a state', () => {
    expect(periodState('CLOSED')).toBe('closed');
    expect(PERIOD_STATES).toEqual(['open', 'closed', 'locked']);
    expect(() => periodState('paid')).toThrow(/not a period state/);
  });
});

describe('closePeriod', () => {
  it('records what the period was closed with', () => {
    const record = closed();
    expect(record.state).toBe('closed');
    expect(record.tickets).toBe(2);
    expect(record.invoiced).toBe(500);
    expect(record.payable).toBe(500);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('carries the credits when there are any', () => {
    const record = closed({ credits: CREDITS });
    expect(record.credited).toBe(40);
    expect(record.payable).toBe(460);
  });

  it('refuses to close a month before it has finished', () => {
    expect(() => closed({ closedOn: '2024-03-20' })).toThrow(/before it has finished/);
    expect(closed({ closedOn: '2024-03-31' }).closedOn).toBe('2024-03-31');
  });

  it('handles the end of a december', () => {
    const december = closePeriod({
      period: '2024-12',
      closedOn: '2024-12-31',
      closedBy: 'k',
      invoice: INVOICE,
    });
    expect(december.period).toBe('2024-12');
  });

  it('demands a closer', () => {
    expect(() => closed({ closedBy: '' })).toThrow(/closedBy is required/);
  });
});

describe('lockPeriod', () => {
  it('locks a closed period', () => {
    const locked = lockPeriod(closed(), { lockedOn: '2024-04-30', lockedBy: 'finance' });
    expect(locked.state).toBe('locked');
    expect(locked.lockedBy).toBe('finance');
    expect(locked.invoiced).toBe(500);
  });

  it('refuses to lock a period twice', () => {
    const locked = lockPeriod(closed(), { lockedOn: '2024-04-30', lockedBy: 'finance' });
    expect(() => lockPeriod(locked, { lockedOn: '2024-05-01', lockedBy: 'finance' })).toThrow(
      /only a closed period/
    );
  });

  it('demands who locked it', () => {
    expect(() => lockPeriod(closed(), { lockedOn: '2024-04-30', lockedBy: '' })).toThrow(
      /lockedBy is required/
    );
  });
});

describe('stateOf and isOpen', () => {
  it('reads open for a period nobody has closed', () => {
    expect(stateOf([], '2024-03')).toBe('open');
    expect(isOpen([], '2024-03')).toBe(true);
  });

  it('reads closed and locked', () => {
    const closures = [closed()];
    expect(stateOf(closures, '2024-03')).toBe('closed');
    expect(isOpen(closures, '2024-03')).toBe(false);
    const locked = [lockPeriod(closed(), { lockedOn: '2024-04-30', lockedBy: 'f' })];
    expect(stateOf(locked, '2024-03')).toBe('locked');
  });

  it('lists the closed periods most recent first', () => {
    const closures = [
      closed(),
      closePeriod({
        period: '2024-04',
        closedOn: '2024-05-02',
        closedBy: 'k',
        invoice: INVOICE,
      }),
    ];
    expect(closedPeriods(closures).map((entry) => entry.period)).toEqual(['2024-04', '2024-03']);
  });
});

describe('billingPeriodFor', () => {
  const posting = { number: 'B1', at: '2024-03-20T09:00' };

  it('bills a posting in its own month while that is open', () => {
    expect(billingPeriodFor(posting, [])).toEqual({
      period: '2024-03',
      late: false,
      from: '2024-03',
    });
  });

  it('moves a late posting forward and says so', () => {
    const result = billingPeriodFor(posting, [closed()]);
    expect(result).toEqual({ period: '2024-04', late: true, from: '2024-03' });
  });

  it('skips over several closed months', () => {
    const closures = [
      closed(),
      closePeriod({ period: '2024-04', closedOn: '2024-05-02', closedBy: 'k', invoice: INVOICE }),
    ];
    expect(billingPeriodFor(posting, closures).period).toBe('2024-05');
  });

  it('gives up when everything ahead is closed', () => {
    const closures = [];
    let period = '2024-03';
    for (let i = 0; i < 61; i += 1) {
      closures.push({ period, state: 'closed' });
      period = nextPeriod(period);
    }
    expect(() => billingPeriodFor(posting, closures)).toThrow(/every period ahead/);
  });
});
