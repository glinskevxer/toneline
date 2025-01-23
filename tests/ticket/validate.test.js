import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_RULES,
  qualityRules,
  checkTicket,
  checkTickets,
  warningCounts,
  cleanShare,
} from '../../src/ticket/validate.js';
import { buildTicket } from '../../src/ticket/record.js';

const A = { lat: 35.4676, lon: -97.5164 };

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
    extent: 'north side of the street east 120 feet',
    excavator: { company: 'Digwell Excavating', phone: '405-555-0148' },
    members: ['CTG01'],
    whiteLined: true,
    site: { points: [A] },
    ...overrides,
  });
}

describe('qualityRules', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_QUALITY_RULES.whiteLineOverFeet).toBe(300);
    expect(qualityRules({ whiteLineOverFeet: 100 }).minExtentWords).toBe(3);
  });
});

describe('checkTicket', () => {
  it('says nothing about a good ticket', () => {
    expect(checkTicket(ticket())).toEqual([]);
  });

  it('notices a marking ticket with no grids', () => {
    expect(checkTicket(ticket({ site: null }))).toContain(
      'no grid points, so the work area had to be guessed from the address'
    );
  });

  it('says nothing about grids on a design request', () => {
    expect(checkTicket(ticket({ type: 'DESIGN', site: null }))).not.toContain(
      'no grid points, so the work area had to be guessed from the address'
    );
  });

  it('notices a missing or thin extent', () => {
    expect(checkTicket(ticket({ extent: null }))).toContain('no extent was given');
    expect(checkTicket(ticket({ extent: 'the yard' }))).toContain(
      'the extent is too short to place the dig'
    );
  });

  it('notices a long dig with no white lining', () => {
    const long = ticket({ extent: 'along the whole block 900 feet', whiteLined: false });
    expect(checkTicket(long)).toContain('a dig of 900 feet was not white lined');
  });

  it('says nothing when a long dig was white lined', () => {
    const long = ticket({ extent: 'along the whole block 900 feet', whiteLined: true });
    expect(checkTicket(long)).not.toContain('a dig of 900 feet was not white lined');
  });

  it('honours a tighter white lining rule', () => {
    const rules = qualityRules({ whiteLineOverFeet: 50 });
    expect(checkTicket(ticket({ whiteLined: false }), { rules })).toContain(
      'a dig of 120 feet was not white lined'
    );
  });

  it('notices an excavator nobody can reach', () => {
    expect(checkTicket(ticket({ excavator: null }))).toContain('no excavator was named');
    expect(checkTicket(ticket({ excavator: { company: 'Digwell' } }))).toContain(
      'the excavator cannot be reached from what the ticket carries'
    );
  });

  it('notices a ticket routed to nobody', () => {
    expect(checkTicket(ticket({ members: [] }))).toContain(
      'the centre routed the ticket to nobody'
    );
  });

  it('notices a bore with no depth', () => {
    expect(checkTicket(ticket({ boring: true }))).toContain('a bore was declared with no depth');
    expect(checkTicket(ticket({ boring: true, depthFeet: 6 }))).toEqual([]);
  });

  it('notices a work area nobody could mark in a day', () => {
    const huge = ticket({ extent: 'the whole subdivision 1200 feet' });
    expect(checkTicket(huge)).toContain('the work area is too large to mark in one visit');
  });
});

describe('checkTickets and the roll up', () => {
  const tickets = [
    ticket(),
    ticket({ number: 'B240315000421', extent: null, members: [] }),
    ticket({ number: 'B240315000422', members: [] }),
  ];

  it('keeps only the tickets with something to say', () => {
    const results = checkTickets(tickets);
    expect(results.map((entry) => entry.number)).toEqual(['B240315000421', 'B240315000422']);
  });

  it('counts the warnings worst first', () => {
    const counts = warningCounts(checkTickets(tickets));
    expect(counts[0]).toEqual({ warning: 'the centre routed the ticket to nobody', count: 2 });
  });

  it('counts nothing from a clean set', () => {
    expect(warningCounts(checkTickets([ticket()]))).toEqual([]);
  });

  it('measures the share that came in clean', () => {
    expect(cleanShare(tickets)).toBeCloseTo(1 / 3, 6);
    expect(cleanShare([ticket()])).toBe(1);
    expect(cleanShare([])).toBe(1);
  });
});
