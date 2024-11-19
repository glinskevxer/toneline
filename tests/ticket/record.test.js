import { describe, expect, it } from 'vitest';
import {
  buildTicket,
  typeOf,
  needsMarking,
  siteKey,
  isReachable,
  describeTicket,
  withTicketFields,
} from '../../src/ticket/record.js';
import { TicketError } from '../../src/core/errors.js';

const RAW = {
  number: 'B240315000420',
  type: 'normal',
  takenAt: '2024-03-15T07:42',
  state: 'OK',
  county: 'Oklahoma',
  place: 'Oklahoma City',
  address: '1420 N.W. 23RD ST',
  workType: 'sewer lateral repair',
  excavator: { company: 'Digwell Excavating', contact: 'R Massey', phone: '405-555-0148' },
  extent: 'north side of the street from the driveway east 120 feet',
  boring: 'Y',
  members: 'OKGAS01, OKELEC02',
};

describe('buildTicket', () => {
  it('builds a frozen record', () => {
    const ticket = buildTicket(RAW);
    expect(Object.isFrozen(ticket)).toBe(true);
    expect(Object.isFrozen(ticket.excavator)).toBe(true);
  });

  it('splits the ticket number', () => {
    const ticket = buildTicket(RAW);
    expect(ticket.base).toBe('B240315000420');
    expect(ticket.revision).toBe(0);
    expect(ticket.centre).toBe('B');
  });

  it('keeps the revision on the number when there is one', () => {
    const ticket = buildTicket({ ...RAW, number: 'B240315000420-02' });
    expect(ticket.number).toBe('B240315000420-02');
    expect(ticket.revision).toBe(2);
    expect(ticket.base).toBe('B240315000420');
  });

  it('normalises the type and the status', () => {
    const ticket = buildTicket(RAW);
    expect(ticket.type).toBe('NORMAL');
    expect(ticket.status).toBe('RECEIVED');
  });

  it('accepts the transmission spelling of the type', () => {
    expect(buildTicket({ ...RAW, type: undefined, transmission: 'EMERGENCY' }).type).toBe(
      'EMERGENCY'
    );
  });

  it('reads members from a separated string and upper cases them', () => {
    expect(buildTicket(RAW).members).toEqual(['OKGAS01', 'OKELEC02']);
  });

  it('reads the boring flag', () => {
    expect(buildTicket(RAW).boring).toBe(true);
    expect(buildTicket(RAW).blasting).toBe(false);
  });

  it('defaults receivedAt to when the call was taken', () => {
    expect(buildTicket(RAW).receivedAt).toBe('2024-03-15T07:42');
    expect(buildTicket({ ...RAW, receivedAt: '2024-03-15T07:50' }).receivedAt).toBe(
      '2024-03-15T07:50'
    );
  });

  it('takes an excavator given as a bare name', () => {
    const ticket = buildTicket({ ...RAW, excavator: 'Digwell Excavating' });
    expect(ticket.excavator).toEqual({
      company: 'Digwell Excavating',
      contact: null,
      phone: null,
      email: null,
      contactProblems: [],
    });
  });

  it('leaves the excavator null when there is none', () => {
    expect(buildTicket({ ...RAW, excavator: null }).excavator).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildTicket(null)).toThrow(TicketError);
    expect(() => buildTicket('B240315000420')).toThrow(/built from an object/);
  });

  it('rejects a missing or unreadable ticket number', () => {
    expect(() => buildTicket({ ...RAW, number: undefined })).toThrow(/number is required/);
    expect(() => buildTicket({ ...RAW, number: '12345' })).toThrow(/centre format/);
  });

  it('rejects an unknown ticket type', () => {
    expect(() => buildTicket({ ...RAW, type: 'ROUTINE' })).toThrow(/not one this desk handles/);
  });

  it('rejects timestamps and dates of the wrong shape', () => {
    expect(() => buildTicket({ ...RAW, takenAt: '2024-03-15' })).toThrow(/takenAt must be/);
    expect(() => buildTicket({ ...RAW, expiresOn: '2024-04-08T00:00' })).toThrow(/expiresOn must/);
    expect(() => buildTicket({ ...RAW, lawfulStartAt: '2024-03-19' })).toThrow(/lawfulStartAt/);
    expect(() => buildTicket({ ...RAW, receivedAt: 'yesterday' })).toThrow(/receivedAt must be/);
  });

  it('rejects a ticket with nowhere to dig', () => {
    expect(() => buildTicket({ ...RAW, address: null })).toThrow(/address or an intersection/);
  });

  it('accepts an intersection instead of an address', () => {
    const ticket = buildTicket({ ...RAW, address: null, intersection: 'N Walker Ave' });
    expect(ticket.intersection).toBe('N Walker Ave');
  });

  it('rejects an excavator record with no company', () => {
    expect(() => buildTicket({ ...RAW, excavator: { contact: 'R Massey' } })).toThrow(
      /excavator.company is required/
    );
  });

  it('rejects an excavator that is neither a name nor a record', () => {
    expect(() => buildTicket({ ...RAW, excavator: 42 })).toThrow(/name or a record/);
  });
});

describe('derived helpers', () => {
  const ticket = buildTicket(RAW);

  it('looks the ticket type up', () => {
    expect(typeOf(ticket).waitBusinessDays).toBe(2);
  });

  it('says whether a locator is needed', () => {
    expect(needsMarking(ticket)).toBe(true);
    expect(needsMarking(buildTicket({ ...RAW, type: 'DESIGN' }))).toBe(false);
    expect(needsMarking(buildTicket({ ...RAW, status: 'CANCELLED' }))).toBe(false);
  });

  it('builds a site key that survives spelling', () => {
    const other = buildTicket({ ...RAW, address: '1420 northwest 23 street' });
    expect(siteKey(other)).toBe(siteKey(ticket));
  });

  it('includes the intersection in the site key', () => {
    const crossed = buildTicket({ ...RAW, intersection: 'N. Walker Ave' });
    expect(siteKey(crossed)).not.toBe(siteKey(ticket));
    expect(siteKey(crossed)).toContain('N WALKER AVE');
  });

  it('describes a ticket in one line', () => {
    expect(describeTicket(ticket)).toBe('B240315000420 NORMAL 1420 N.W. 23RD ST');
  });

  it('falls back to the intersection when describing', () => {
    const crossed = buildTicket({ ...RAW, address: null, intersection: 'N Walker Ave' });
    expect(describeTicket(crossed)).toContain('N Walker Ave');
  });

  it('revalidates a changed copy', () => {
    const changed = withTicketFields(ticket, { status: 'SCREENED' });
    expect(changed.status).toBe('SCREENED');
    expect(changed.number).toBe(ticket.number);
    expect(() => withTicketFields(ticket, { type: 'ROUTINE' })).toThrow(TicketError);
  });
});

describe('the excavator contact block', () => {
  it('formats a phone number one way', () => {
    const ticket = buildTicket({ ...RAW, excavator: { company: 'x', phone: '(405) 555-0148' } });
    expect(ticket.excavator.phone).toBe('405 555 0148');
  });

  it('lower cases an email address', () => {
    const ticket = buildTicket({
      ...RAW,
      excavator: { company: 'x', email: 'RM@Digwell.Example' },
    });
    expect(ticket.excavator.email).toBe('rm@digwell.example');
  });

  it('keeps a number it cannot format and says why', () => {
    const ticket = buildTicket({ ...RAW, excavator: { company: 'x', phone: '555-0148' } });
    expect(ticket.excavator.phone).toBe('555-0148');
    expect(ticket.excavator.contactProblems).toContain(
      'the phone number does not have enough digits to dial'
    );
  });

  it('does not count a missing detail as a problem', () => {
    const ticket = buildTicket({ ...RAW, excavator: { company: 'x' } });
    expect(ticket.excavator.contactProblems).toEqual([]);
  });

  it('gives a bare name an empty problem list', () => {
    expect(buildTicket({ ...RAW, excavator: 'Digwell' }).excavator.contactProblems).toEqual([]);
  });

  it('says whether the excavator can be reached', () => {
    expect(isReachable(buildTicket(RAW))).toBe(true);
    expect(isReachable(buildTicket({ ...RAW, excavator: null }))).toBe(false);
    expect(isReachable(buildTicket({ ...RAW, excavator: { company: 'x' } }))).toBe(false);
    expect(
      isReachable(buildTicket({ ...RAW, excavator: { company: 'x', phone: '555-0148' } }))
    ).toBe(false);
  });
});
