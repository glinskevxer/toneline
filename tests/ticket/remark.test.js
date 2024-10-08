import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMARK_POLICY,
  remarkPolicy,
  buildRemark,
  assessRemark,
  remarkMarksThrough,
  remarkCharge,
  remarksFor,
} from '../../src/ticket/remark.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildResponse } from '../../src/response/post.js';
import { TicketError } from '../../src/core/errors.js';
import { Calendar } from '../../src/time/calendar.js';

const calendar = new Calendar();

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

function request(overrides = {}) {
  return buildRemark({
    number: 'B240315000420',
    requestedAt: '2024-03-25T09:00',
    requestedBy: 'R Massey',
    ...overrides,
  });
}

const MARKED = [
  buildResponse({
    number: 'B240315000420',
    code: '2',
    at: '2024-03-15T10:00',
    by: 'loc-1',
    marksThrough: '2024-03-28',
  }),
];

describe('remarkPolicy', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_REMARK_POLICY.freeRemarks).toBe(2);
    expect(remarkPolicy({ chargeableRate: 50 }).freeRemarks).toBe(2);
  });

  it('rejects a bad free count', () => {
    expect(() => remarkPolicy({ freeRemarks: -1 })).toThrow(TicketError);
    expect(() => remarkPolicy({ freeRemarks: 1.5 })).toThrow(/whole number/);
  });
});

describe('buildRemark', () => {
  it('builds a frozen request', () => {
    const built = request();
    expect(built.number).toBe('B240315000420');
    expect(built.scope).toBe('ALL');
    expect(built.reason).toBe('marks no longer visible');
    expect(Object.isFrozen(built)).toBe(true);
  });

  it('takes a scope and a reason', () => {
    const built = request({ scope: 'gas', reason: 'flags pulled by the mower' });
    expect(built.scope).toBe('GAS');
    expect(built.reason).toBe('flags pulled by the mower');
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildRemark(null)).toThrow(TicketError);
  });

  it('rejects a missing requester or a bad timestamp', () => {
    expect(() => buildRemark({ number: 'B1', requestedAt: '2024-03-25T09:00' })).toThrow(
      /requestedBy is required/
    );
    expect(() =>
      buildRemark({ number: 'B1', requestedAt: '2024-03-25', requestedBy: 'x' })
    ).toThrow(/needs a timestamp/);
  });
});

describe('assessRemark', () => {
  it('allows a first remark on a live marked ticket', () => {
    const verdict = assessRemark(ticket(), request(), { responses: MARKED, calendar });
    expect(verdict.allowed).toBe(true);
    expect(verdict.chargeable).toBe(false);
    expect(verdict.sequence).toBe(1);
    expect(verdict.reason).toBeNull();
  });

  it('charges once the free ones are used up', () => {
    const verdict = assessRemark(ticket(), request(), {
      responses: MARKED,
      existing: [request(), request()],
      calendar,
    });
    expect(verdict.sequence).toBe(3);
    expect(verdict.chargeable).toBe(true);
    expect(verdict.allowed).toBe(true);
  });

  it('counts only remarks against the same ticket', () => {
    const other = request({ number: 'B240315000421' });
    const verdict = assessRemark(ticket(), request(), {
      responses: MARKED,
      existing: [other, other, other],
      calendar,
    });
    expect(verdict.sequence).toBe(1);
  });

  it('refuses a cancelled ticket', () => {
    const verdict = assessRemark(ticket({ status: 'CANCELLED' }), request(), {
      responses: MARKED,
      calendar,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/cancelled/);
  });

  it('refuses an expired ticket', () => {
    const verdict = assessRemark(ticket(), request({ requestedAt: '2024-04-10T09:00' }), {
      responses: MARKED,
      calendar,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/already expired/);
  });

  it('refuses a ticket nothing was marked on', () => {
    const verdict = assessRemark(ticket(), request(), { responses: [], calendar });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/nothing has been marked/);
  });

  it('ignores a marks posting against another ticket', () => {
    const other = buildResponse({ ...MARKED[0], number: 'B240315000421' });
    expect(assessRemark(ticket(), request(), { responses: [other], calendar }).allowed).toBe(false);
  });

  it('honours a wider free allowance', () => {
    const verdict = assessRemark(ticket(), request(), {
      responses: MARKED,
      existing: [request(), request()],
      policy: remarkPolicy({ freeRemarks: 5 }),
      calendar,
    });
    expect(verdict.chargeable).toBe(false);
  });
});

describe('remarkMarksThrough and remarkCharge', () => {
  it('runs the new marks from the request date', () => {
    expect(remarkMarksThrough(request())).toBe('2024-04-07');
    expect(remarkMarksThrough(request(), { markLifeDays: 7 })).toBe('2024-03-31');
  });

  it('charges nothing while the free ones last', () => {
    const free = assessRemark(ticket(), request(), { responses: MARKED, calendar });
    expect(remarkCharge(free)).toBe(0);
  });

  it('charges the contract rate after that', () => {
    const paid = assessRemark(ticket(), request(), {
      responses: MARKED,
      existing: [request(), request()],
      calendar,
    });
    expect(remarkCharge(paid)).toBe(35);
    expect(remarkCharge(paid, remarkPolicy({ chargeableRate: 50 }))).toBe(50);
  });
});

describe('remarksFor', () => {
  it('gathers one ticket oldest first', () => {
    const later = request({ requestedAt: '2024-03-26T09:00' });
    const other = request({ number: 'B240315000421' });
    const found = remarksFor([later, request(), other], 'b240315000420');
    expect(found.map((entry) => entry.requestedAt)).toEqual([
      '2024-03-25T09:00',
      '2024-03-26T09:00',
    ]);
  });
});
