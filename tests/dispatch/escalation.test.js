import { describe, expect, it } from 'vitest';
import {
  ESCALATION_LEVELS,
  DEFAULT_ESCALATION_POLICY,
  escalationPolicy,
  worseLevel,
  assessEscalation,
  escalations,
  contactFor,
  levelCounts,
} from '../../src/dispatch/escalation.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildAssignment } from '../../src/dispatch/assign.js';
import { buildDistricts } from '../../src/network/district.js';
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

const ASSIGNED = buildAssignment({
  number: 'B240315000420',
  locatorId: 'loc-1',
  at: '2024-03-13T10:00',
  by: 'dispatch',
});

describe('levels', () => {
  it('lists them in order', () => {
    expect(ESCALATION_LEVELS).toEqual(['none', 'supervisor', 'manager', 'duty officer']);
  });

  it('takes the worse of two', () => {
    expect(worseLevel('none', 'manager')).toBe('manager');
    expect(worseLevel('duty officer', 'supervisor')).toBe('duty officer');
    expect(worseLevel('none', 'none')).toBe('none');
  });

  it('ships a default policy and merges an override', () => {
    expect(DEFAULT_ESCALATION_POLICY.warnMinutesBeforeDue).toBe(60);
    expect(escalationPolicy({ warnMinutesBeforeDue: 30 }).breachManagerMinutes).toBe(120);
  });
});

describe('assessEscalation', () => {
  it('escalates nothing on an answered ticket', () => {
    const record = assessEscalation(ticket(), {
      at: '2024-03-15T12:00',
      answered: true,
      calendar,
    });
    expect(record.level).toBe('none');
    expect(record.reasons).toEqual([]);
    expect(record.minutesLeft).toBeNull();
  });

  it('escalates nothing while there is time', () => {
    expect(assessEscalation(ticket(), { at: '2024-03-14T09:00', calendar }).level).toBe('none');
  });

  it('warns a supervisor as the deadline closes', () => {
    const record = assessEscalation(ticket(), { at: '2024-03-15T08:15', calendar });
    expect(record.level).toBe('supervisor');
    expect(record.reasons).toContain('the response deadline is close');
  });

  it('escalates a breach to a supervisor and then a manager', () => {
    expect(assessEscalation(ticket(), { at: '2024-03-15T09:30', calendar }).level).toBe(
      'supervisor'
    );
    const late = assessEscalation(ticket(), { at: '2024-03-15T12:00', calendar });
    expect(late.level).toBe('manager');
    expect(late.reasons).toContain('the deadline passed some time ago');
  });

  it('escalates an emergency nobody has picked up', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-14T08:00' });
    const record = assessEscalation(urgent, { at: '2024-03-14T08:20', calendar });
    expect(record.level).toBe('supervisor');
    expect(record.reasons).toContain('an emergency has not been picked up');
  });

  it('does not chase an emergency that has been picked up', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-14T08:00' });
    const record = assessEscalation(urgent, {
      at: '2024-03-14T08:20',
      assignment: ASSIGNED,
      calendar,
    });
    expect(record.reasons).not.toContain('an emergency has not been picked up');
  });

  it('takes a missed emergency all the way to the duty officer', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-14T08:00' });
    const record = assessEscalation(urgent, { at: '2024-03-14T10:30', calendar });
    expect(record.level).toBe('duty officer');
    expect(record.reasons).toContain('an emergency has been missed');
  });

  it('escalates a critical conflict left with nobody', () => {
    const record = assessEscalation(ticket(), {
      at: '2024-03-14T09:00',
      screening: { critical: true },
      calendar,
    });
    expect(record.level).toBe('manager');
    expect(record.reasons).toContain('a critical conflict is still with nobody');
  });

  it('leaves a critical conflict alone once it is assigned', () => {
    const record = assessEscalation(ticket(), {
      at: '2024-03-14T09:00',
      screening: { critical: true },
      assignment: ASSIGNED,
      calendar,
    });
    expect(record.level).toBe('none');
  });

  it('honours a tighter warning window', () => {
    const policy = escalationPolicy({ warnMinutesBeforeDue: 5 });
    expect(assessEscalation(ticket(), { at: '2024-03-15T08:15', calendar, policy }).level).toBe(
      'none'
    );
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(assessEscalation(ticket(), { at: '2024-03-14T09:00', calendar }))).toBe(
      true
    );
  });
});

describe('escalations', () => {
  const entries = [
    { ticket: ticket({ number: 'B240315000420' }) },
    { ticket: ticket({ number: 'B240315000421' }), answered: true },
    {
      ticket: ticket({ number: 'B240315000422', type: 'EMERGENCY', takenAt: '2024-03-14T08:00' }),
    },
  ];

  it('keeps only what needs escalating, worst first', () => {
    const found = escalations(entries, { at: '2024-03-15T12:00', calendar });
    expect(found.map((record) => record.number)).toEqual(['B240315000422', 'B240315000420']);
    expect(found[0].level).toBe('duty officer');
  });

  it('finds nothing when everything is in hand', () => {
    expect(escalations(entries, { at: '2024-03-13T10:00', calendar })).toEqual([]);
  });

  it('counts the levels', () => {
    const found = escalations(entries, { at: '2024-03-15T12:00', calendar });
    expect(levelCounts(found)).toEqual({
      none: 0,
      supervisor: 0,
      manager: 1,
      'duty officer': 1,
    });
  });
});

describe('contactFor', () => {
  const districts = buildDistricts([
    {
      code: 'CENTRAL',
      contact: '405 555 0111',
      afterHoursPhone: '405 555 0199',
      boundary: [
        { lat: 35.44, lon: -97.56 },
        { lat: 35.48, lon: -97.56 },
        { lat: 35.48, lon: -97.5 },
      ],
    },
    {
      code: 'NORTH',
      contact: '405 555 0112',
      boundary: [
        { lat: 35.48, lon: -97.56 },
        { lat: 35.54, lon: -97.56 },
        { lat: 35.54, lon: -97.5 },
      ],
    },
  ]);

  it('prefers the after hours number', () => {
    expect(contactFor(districts, 'CENTRAL')).toBe('405 555 0199');
  });

  it('falls back to the day number', () => {
    expect(contactFor(districts, 'north')).toBe('405 555 0112');
  });

  it('falls back to the desk for a district it does not know', () => {
    expect(contactFor(districts, 'SOUTH', 'desk')).toBe('desk');
    expect(contactFor(districts, 'SOUTH')).toBeNull();
  });
});
