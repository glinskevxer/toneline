import { describe, expect, it } from 'vitest';
import {
  lawfulStartFrom,
  lawfulStartFor,
  effectiveLawfulStart,
  lawfulStartDisagrees,
  mayDigAt,
  noticeHours,
  expiryFrom,
} from '../../src/ticket/lawfulStart.js';
import { buildTicket } from '../../src/ticket/record.js';
import { Calendar } from '../../src/time/calendar.js';
import { ScheduleError } from '../../src/core/errors.js';

const calendar = new Calendar({
  holidays: [{ kind: 'fixed', month: 7, day: 4, name: 'independence day' }],
});

function ticketAt(takenAt, overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt,
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

describe('lawfulStartFrom', () => {
  it('counts two full business days after a morning call', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-13T09:00', type: 'NORMAL', calendar })).toBe(
      '2024-03-15T09:00'
    );
  });

  it('does not count the day when the call came after the cutoff', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-13T17:30', type: 'NORMAL', calendar })).toBe(
      '2024-03-18T17:30'
    );
  });

  it('treats the cutoff minute itself as too late', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-13T17:00', type: 'NORMAL', calendar })).toBe(
      '2024-03-18T17:00'
    );
  });

  it('honours a different cutoff', () => {
    expect(
      lawfulStartFrom({ takenAt: '2024-03-13T15:30', type: 'NORMAL', calendar, cutoff: '15:00' })
    ).toBe('2024-03-18T15:30');
  });

  it('starts the count on the next business day for a weekend call', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-16T09:00', type: 'NORMAL', calendar })).toBe(
      '2024-03-20T09:00'
    );
  });

  it('steps over a holiday', () => {
    expect(lawfulStartFrom({ takenAt: '2024-07-02T09:00', type: 'NORMAL', calendar })).toBe(
      '2024-07-05T09:00'
    );
  });

  it('steps over a holiday that lands next to a weekend', () => {
    expect(lawfulStartFrom({ takenAt: '2024-07-03T09:00', type: 'NORMAL', calendar })).toBe(
      '2024-07-08T09:00'
    );
  });

  it('lets an emergency start at once', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-16T22:15', type: 'EMERGENCY', calendar })).toBe(
      '2024-03-16T22:15'
    );
  });

  it('gives a short notice one business day', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-13T09:00', type: 'SHORT', calendar })).toBe(
      '2024-03-14T09:00'
    );
  });

  it('gives a design request ten business days', () => {
    expect(lawfulStartFrom({ takenAt: '2024-03-13T09:00', type: 'DESIGN', calendar })).toBe(
      '2024-03-27T09:00'
    );
  });

  it('rejects a calendar that is not one', () => {
    expect(() =>
      lawfulStartFrom({ takenAt: '2024-03-13T09:00', type: 'NORMAL', calendar: {} })
    ).toThrow(ScheduleError);
  });

  it('defaults to a plain weekday calendar', () => {
    expect(lawfulStartFrom({ takenAt: '2024-07-02T09:00', type: 'NORMAL' })).toBe(
      '2024-07-04T09:00'
    );
  });
});

describe('lawfulStartFor and effectiveLawfulStart', () => {
  it('works from the ticket', () => {
    expect(lawfulStartFor(ticketAt('2024-03-13T09:00'), { calendar })).toBe('2024-03-15T09:00');
  });

  it('keeps a later start the centre stated', () => {
    const ticket = ticketAt('2024-03-13T09:00', { lawfulStartAt: '2024-03-18T09:00' });
    expect(effectiveLawfulStart(ticket, { calendar })).toBe('2024-03-18T09:00');
  });

  it('overrides an earlier start the centre stated', () => {
    const ticket = ticketAt('2024-03-13T09:00', { lawfulStartAt: '2024-03-14T09:00' });
    expect(effectiveLawfulStart(ticket, { calendar })).toBe('2024-03-15T09:00');
  });

  it('uses the computed start when the centre sent none', () => {
    expect(effectiveLawfulStart(ticketAt('2024-03-13T09:00'), { calendar })).toBe(
      '2024-03-15T09:00'
    );
  });

  it('reports a disagreement either way', () => {
    expect(lawfulStartDisagrees(ticketAt('2024-03-13T09:00'), { calendar })).toBe(false);
    const early = ticketAt('2024-03-13T09:00', { lawfulStartAt: '2024-03-14T09:00' });
    expect(lawfulStartDisagrees(early, { calendar })).toBe(true);
    const agreed = ticketAt('2024-03-13T09:00', { lawfulStartAt: '2024-03-15T09:00' });
    expect(lawfulStartDisagrees(agreed, { calendar })).toBe(false);
  });
});

describe('mayDigAt and noticeHours', () => {
  const ticket = ticketAt('2024-03-13T09:00');

  it('refuses before the lawful start and allows on it', () => {
    expect(mayDigAt(ticket, '2024-03-15T08:59', { calendar })).toBe(false);
    expect(mayDigAt(ticket, '2024-03-15T09:00', { calendar })).toBe(true);
    expect(mayDigAt(ticket, '2024-03-16T07:00', { calendar })).toBe(true);
  });

  it('counts the hours of notice', () => {
    expect(noticeHours(ticket, { calendar })).toBe(48);
    expect(noticeHours(ticketAt('2024-03-16T22:15', { type: 'EMERGENCY' }), { calendar })).toBe(0);
  });

  it('counts notice across a weekend', () => {
    expect(noticeHours(ticketAt('2024-03-15T09:00'), { calendar })).toBe(96);
  });
});

describe('expiryFrom', () => {
  it('counts the life inclusively from the lawful start', () => {
    expect(expiryFrom('2024-03-15T09:00', 21)).toBe('2024-04-04');
    expect(expiryFrom('2024-03-15T09:00', 1)).toBe('2024-03-15');
  });

  it('rejects a life of less than a day', () => {
    expect(() => expiryFrom('2024-03-15T09:00', 0)).toThrow(/at least one day/);
    expect(() => expiryFrom('2024-03-15T09:00', 2.5)).toThrow(ScheduleError);
  });
});
