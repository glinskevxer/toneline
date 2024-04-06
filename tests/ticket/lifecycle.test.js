import { describe, expect, it } from 'vitest';
import {
  nextStates,
  canTransition,
  isTerminal,
  transition,
  replay,
  pathTo,
} from '../../src/ticket/lifecycle.js';
import { buildTicket } from '../../src/ticket/record.js';
import { TicketError } from '../../src/core/errors.js';

function ticket(status = 'RECEIVED') {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
    status,
  });
}

describe('nextStates', () => {
  it('lists what may follow', () => {
    expect(nextStates('RECEIVED')).toEqual(['SCREENED', 'CANCELLED', 'VOID']);
  });

  it('normalises the state it is asked about', () => {
    expect(nextStates('in progress')).toContain('RESPONDED');
  });

  it('rejects a state the desk does not use', () => {
    expect(() => nextStates('PENDING')).toThrow(/not one this desk uses/);
  });

  it('hands out a copy so a caller cannot edit the map', () => {
    const list = nextStates('RECEIVED');
    list.push('NONSENSE');
    expect(nextStates('RECEIVED')).toHaveLength(3);
  });
});

describe('canTransition and isTerminal', () => {
  it('allows the moves on the map', () => {
    expect(canTransition('RECEIVED', 'SCREENED')).toBe(true);
    expect(canTransition('RESPONDED', 'CLOSED')).toBe(true);
    expect(canTransition('CLOSED', 'IN_PROGRESS')).toBe(true);
  });

  it('refuses the moves that are not', () => {
    expect(canTransition('RECEIVED', 'CLOSED')).toBe(false);
    expect(canTransition('CANCELLED', 'SCREENED')).toBe(false);
  });

  it('knows the dead ends', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('VOID')).toBe(true);
    expect(isTerminal('CLOSED')).toBe(false);
  });
});

describe('transition', () => {
  it('moves the ticket and records the event', () => {
    const result = transition(ticket(), {
      to: 'SCREENED',
      at: '2024-03-15T08:00',
      by: 'kmartel',
      note: 'inside the gas district',
    });
    expect(result.ticket.status).toBe('SCREENED');
    expect(result.event).toEqual({
      number: 'B240315000420',
      from: 'RECEIVED',
      to: 'SCREENED',
      at: '2024-03-15T08:00',
      by: 'kmartel',
      note: 'inside the gas district',
    });
    expect(Object.isFrozen(result.event)).toBe(true);
  });

  it('leaves the ticket it was given alone', () => {
    const before = ticket();
    transition(before, { to: 'SCREENED', at: '2024-03-15T08:00', by: 'kmartel' });
    expect(before.status).toBe('RECEIVED');
  });

  it('refuses a move that is not allowed and says what is', () => {
    try {
      transition(ticket(), { to: 'CLOSED', at: '2024-03-15T08:00', by: 'kmartel' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TicketError);
      expect(err.details.allowed).toEqual(['SCREENED', 'CANCELLED', 'VOID']);
    }
  });

  it('demands a timestamp and an actor', () => {
    expect(() => transition(ticket(), { to: 'SCREENED', at: '2024-03-15', by: 'k' })).toThrow(
      /needs a timestamp/
    );
    expect(() => transition(ticket(), { to: 'SCREENED', at: '2024-03-15T08:00', by: '' })).toThrow(
      /by is required/
    );
  });
});

describe('replay', () => {
  const events = [
    { to: 'SCREENED', at: '2024-03-15T08:00', by: 'kmartel' },
    { to: 'ASSIGNED', at: '2024-03-15T08:30', by: 'dispatch' },
    { to: 'IN_PROGRESS', at: '2024-03-16T07:15', by: 'locator-14' },
    { to: 'RESPONDED', at: '2024-03-16T09:40', by: 'locator-14' },
  ];

  it('walks the whole run', () => {
    const result = replay(ticket(), events);
    expect(result.ticket.status).toBe('RESPONDED');
    expect(result.events).toHaveLength(4);
  });

  it('does nothing for an empty run', () => {
    const result = replay(ticket(), []);
    expect(result.ticket.status).toBe('RECEIVED');
    expect(result.events).toEqual([]);
  });

  it('rejects an illegal move part way through', () => {
    expect(() =>
      replay(ticket(), [...events, { to: 'ASSIGNED', at: '2024-03-16T10:00', by: 'x' }])
    ).toThrow(/not one the desk allows/);
  });

  it('rejects events that run backwards', () => {
    expect(() =>
      replay(ticket(), [events[0], { to: 'ASSIGNED', at: '2024-03-15T07:00', by: 'x' }])
    ).toThrow(/out of order/);
  });
});

describe('pathTo', () => {
  it('finds the shortest route', () => {
    expect(pathTo('RECEIVED', 'CLOSED')).toEqual(['RECEIVED', 'SCREENED', 'RESPONDED', 'CLOSED']);
  });

  it('returns a single step for the same state', () => {
    expect(pathTo('CLOSED', 'CLOSED')).toEqual(['CLOSED']);
  });

  it('returns nothing when there is no route', () => {
    expect(pathTo('CANCELLED', 'CLOSED')).toBeNull();
  });
});
