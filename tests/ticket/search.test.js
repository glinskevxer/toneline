import { describe, expect, it } from 'vitest';
import {
  matchesNumber,
  matchesStreet,
  matchesExcavator,
  takenBetween,
  search,
  findOne,
  around,
} from '../../src/ticket/search.js';
import { buildTicket } from '../../src/ticket/record.js';

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
    excavator: { company: 'Digwell Excavating Inc' },
    ...overrides,
  });
}

const TICKETS = [
  ticket(),
  ticket({
    number: 'B240316000421',
    takenAt: '2024-03-16T09:00',
    address: '99 Robinson Ave',
    excavator: { company: 'Sooner Underground' },
    status: 'SCREENED',
  }),
  ticket({
    number: 'B240318000422',
    takenAt: '2024-03-18T09:00',
    address: null,
    intersection: 'NW 23rd St and Walker',
    type: 'EMERGENCY',
  }),
];

describe('the single matchers', () => {
  it('matches part of a ticket number in any case', () => {
    expect(matchesNumber(ticket(), '000420')).toBe(true);
    expect(matchesNumber(ticket(), 'b2403')).toBe(true);
    expect(matchesNumber(ticket(), '999')).toBe(false);
    expect(matchesNumber(ticket(), '')).toBe(false);
  });

  it('matches a street however it is spelled', () => {
    expect(matchesStreet(ticket(), 'northwest 23 street')).toBe(true);
    expect(matchesStreet(ticket(), 'NW 23RD')).toBe(true);
    expect(matchesStreet(ticket(), 'Robinson')).toBe(false);
    expect(matchesStreet(ticket(), '')).toBe(false);
  });

  it('matches on the intersection when there is no address', () => {
    expect(matchesStreet(TICKETS[2], 'walker')).toBe(true);
  });

  it('matches part of an excavator name', () => {
    expect(matchesExcavator(ticket(), 'digwell')).toBe(true);
    expect(matchesExcavator(ticket(), 'Sooner')).toBe(false);
    expect(matchesExcavator(ticket({ excavator: null }), 'digwell')).toBe(false);
  });

  it('matches a window at both ends', () => {
    expect(takenBetween(ticket(), '2024-03-15', '2024-03-15')).toBe(true);
    expect(takenBetween(ticket(), '2024-03-10', '2024-03-20')).toBe(true);
    expect(takenBetween(ticket(), '2024-03-16', '2024-03-20')).toBe(false);
  });
});

describe('search', () => {
  it('finds by number', () => {
    expect(search(TICKETS, { number: '000421' }).map((entry) => entry.number)).toEqual([
      'B240316000421',
    ]);
  });

  it('finds by street', () => {
    expect(search(TICKETS, { street: 'nw 23rd' }).map((entry) => entry.number)).toEqual([
      'B240318000422',
      'B240315000420',
    ]);
  });

  it('finds by excavator', () => {
    expect(search(TICKETS, { excavator: 'sooner' })).toHaveLength(1);
  });

  it('finds by status and by type', () => {
    expect(search(TICKETS, { status: 'screened' })).toHaveLength(1);
    expect(search(TICKETS, { type: 'emergency' })).toHaveLength(1);
  });

  it('finds by window, defaulting the far end to the near one', () => {
    expect(search(TICKETS, { from: '2024-03-16' })).toHaveLength(1);
    expect(search(TICKETS, { from: '2024-03-15', to: '2024-03-16' })).toHaveLength(2);
  });

  it('requires every term given to match', () => {
    expect(search(TICKETS, { street: 'nw 23rd', type: 'emergency' })).toHaveLength(1);
    expect(search(TICKETS, { street: 'robinson', type: 'emergency' })).toEqual([]);
  });

  it('returns nothing rather than everything for an empty search', () => {
    expect(search(TICKETS, {})).toEqual([]);
    expect(search(TICKETS, { number: '  ' })).toEqual([]);
  });

  it('sorts newest first', () => {
    expect(search(TICKETS, { number: 'B24' }).map((entry) => entry.number)).toEqual([
      'B240318000422',
      'B240316000421',
      'B240315000420',
    ]);
  });
});

describe('findOne', () => {
  it('answers when the search is unambiguous', () => {
    expect(findOne(TICKETS, { number: '000421' }).number).toBe('B240316000421');
  });

  it('answers nothing when the search is not', () => {
    expect(findOne(TICKETS, { number: 'B24' })).toBeNull();
    expect(findOne(TICKETS, { number: 'nothing' })).toBeNull();
  });
});

describe('around', () => {
  it('finds tickets near a date, closest first', () => {
    expect(around(TICKETS, '2024-03-16', 2).map((entry) => entry.number)).toEqual([
      'B240316000421',
      'B240315000420',
      'B240318000422',
    ]);
  });

  it('honours the window', () => {
    expect(around(TICKETS, '2024-03-16', 0)).toHaveLength(1);
  });

  it('finds nothing far from everything', () => {
    expect(around(TICKETS, '2024-06-01')).toEqual([]);
  });
});
