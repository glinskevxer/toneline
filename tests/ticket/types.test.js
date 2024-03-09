import { describe, expect, it } from 'vitest';
import {
  TICKET_TYPE_CODES,
  ticketType,
  isTicketType,
  markingTicketTypes,
  FACILITY_TYPE_CODES,
  facilityType,
  isFacilityType,
  criticalFacilityTypes,
  TICKET_STATUSES,
  ticketStatus,
} from '../../src/ticket/types.js';
import { TicketError } from '../../src/core/errors.js';

describe('ticket types', () => {
  it('lists the codes the desk handles', () => {
    expect(TICKET_TYPE_CODES).toContain('NORMAL');
    expect(TICKET_TYPE_CODES).toContain('EMERGENCY');
    expect(TICKET_TYPE_CODES).toHaveLength(9);
  });

  it('carries the waiting period and the response window', () => {
    expect(ticketType('NORMAL').waitBusinessDays).toBe(2);
    expect(ticketType('EMERGENCY').waitBusinessDays).toBe(0);
    expect(ticketType('EMERGENCY').responseHours).toBe(2);
    expect(ticketType('DESIGN').waitBusinessDays).toBe(10);
  });

  it('accepts any case and surrounding space', () => {
    expect(ticketType(' normal ').code).toBe('NORMAL');
  });

  it('rejects an unknown code and says what it knows', () => {
    try {
      ticketType('ROUTINE');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TicketError);
      expect(err.details.known).toContain('NORMAL');
    }
  });

  it('rejects a missing code', () => {
    expect(() => ticketType(undefined)).toThrow(/not one this desk handles/);
  });

  it('answers membership without throwing', () => {
    expect(isTicketType('meet')).toBe(true);
    expect(isTicketType('routine')).toBe(false);
    expect(isTicketType(null)).toBe(false);
  });

  it('freezes the entries it hands out', () => {
    expect(Object.isFrozen(ticketType('NORMAL'))).toBe(true);
  });

  it('names the types that put a locator on the ground', () => {
    const marking = markingTicketTypes();
    expect(marking).toContain('NORMAL');
    expect(marking).not.toContain('DESIGN');
    expect(marking).not.toContain('CANCEL');
  });

  it('ranks an emergency ahead of a design request', () => {
    expect(ticketType('EMERGENCY').rank).toBeLessThan(ticketType('DESIGN').rank);
  });
});

describe('facility types', () => {
  it('lists the codes the operator carries', () => {
    expect(FACILITY_TYPE_CODES).toHaveLength(10);
    expect(FACILITY_TYPE_CODES).toContain('FIBRE');
  });

  it('carries the marking colour and the tolerance zone', () => {
    expect(facilityType('GAS').colour).toBe('yellow');
    expect(facilityType('GAS').toleranceFeet).toBe(18);
    expect(facilityType('PETROLEUM').toleranceFeet).toBe(36);
  });

  it('rejects an unknown facility type', () => {
    expect(() => facilityType('AIR')).toThrow(/not one this operator carries/);
  });

  it('answers membership without throwing', () => {
    expect(isFacilityType('gas')).toBe(true);
    expect(isFacilityType('air')).toBe(false);
  });

  it('names the critical facilities', () => {
    const critical = criticalFacilityTypes();
    expect(critical).toContain('GAS');
    expect(critical).toContain('FIBRE');
    expect(critical).not.toContain('WATER');
  });
});

describe('ticket status', () => {
  it('lists the states in order', () => {
    expect(TICKET_STATUSES[0]).toBe('RECEIVED');
    expect(TICKET_STATUSES).toContain('RESPONDED');
  });

  it('normalises spacing and dashes', () => {
    expect(ticketStatus('in progress')).toBe('IN_PROGRESS');
    expect(ticketStatus('in-progress')).toBe('IN_PROGRESS');
  });

  it('rejects a state the desk does not use', () => {
    expect(() => ticketStatus('PENDING')).toThrow(/not one this desk uses/);
  });
});
