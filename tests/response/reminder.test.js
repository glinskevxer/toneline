import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_STAGES,
  reminderRules,
  stageFor,
  remindersDue,
  byRecipient,
  reminderLine,
  alreadySent,
  overdueOnly,
  beatenByAnswer,
} from '../../src/response/reminder.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildResponse } from '../../src/response/post.js';
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

describe('reminderRules', () => {
  it('sorts the stages widest first', () => {
    expect(reminderRules([15, 240, 60])).toEqual([240, 60, 15]);
    expect(DEFAULT_REMINDER_STAGES).toEqual([240, 60, 15]);
  });

  it('rejects an empty or nonsense stage list', () => {
    expect(() => reminderRules([])).toThrow(TypeError);
    expect(() => reminderRules([0])).toThrow(/above zero/);
    expect(() => reminderRules([1.5])).toThrow(/whole number/);
    expect(() => reminderRules('soon')).toThrow(/list with something/);
  });
});

describe('stageFor', () => {
  it('is nothing while there is plenty of time', () => {
    expect(stageFor(600)).toBeNull();
  });

  it('picks the tightest stage the ticket has passed', () => {
    expect(stageFor(240)).toBe('240');
    expect(stageFor(120)).toBe('240');
    expect(stageFor(60)).toBe('60');
    expect(stageFor(30)).toBe('60');
    expect(stageFor(15)).toBe('15');
    expect(stageFor(0)).toBe('15');
  });

  it('calls a passed deadline overdue', () => {
    expect(stageFor(-1)).toBe('overdue');
  });
});

describe('remindersDue', () => {
  const entries = [{ ticket: ticket(), locatorId: 'loc-14' }];

  it('sends nothing while there is time', () => {
    expect(remindersDue(entries, { at: '2024-03-14T09:00', calendar })).toEqual([]);
  });

  it('sends one at the first stage', () => {
    const due = remindersDue(entries, { at: '2024-03-15T06:00', calendar });
    expect(due).toHaveLength(1);
    expect(due[0].stage).toBe('240');
    expect(due[0].locatorId).toBe('LOC-14');
  });

  it('sends the tighter stage as the deadline closes', () => {
    expect(remindersDue(entries, { at: '2024-03-15T08:30', calendar })[0].stage).toBe('60');
    expect(remindersDue(entries, { at: '2024-03-15T08:50', calendar })[0].stage).toBe('15');
  });

  it('sends an overdue nudge once the deadline has passed', () => {
    expect(remindersDue(entries, { at: '2024-03-15T10:00', calendar })[0].stage).toBe('overdue');
  });

  it('sends nothing on a ticket that has been answered', () => {
    const posted = buildResponse({
      number: 'B240315000420',
      code: '1',
      at: '2024-03-14T09:00',
      by: 'loc-14',
    });
    expect(
      remindersDue(entries, { at: '2024-03-15T08:30', responses: [posted], calendar })
    ).toEqual([]);
  });

  it('does not send the same stage twice', () => {
    const first = remindersDue(entries, { at: '2024-03-15T08:30', calendar });
    expect(remindersDue(entries, { at: '2024-03-15T08:40', sent: first, calendar })).toEqual([]);
  });

  it('still sends the next stage down', () => {
    const first = remindersDue(entries, { at: '2024-03-15T08:30', calendar });
    const second = remindersDue(entries, { at: '2024-03-15T08:50', sent: first, calendar });
    expect(second[0].stage).toBe('15');
  });

  it('sorts the closest deadline first', () => {
    const many = [
      { ticket: ticket() },
      { ticket: ticket({ number: 'B240315000421', takenAt: '2024-03-12T09:00' }) },
    ];
    const due = remindersDue(many, { at: '2024-03-15T08:30', calendar });
    expect(due[0].number).toBe('B240315000421');
  });

  it('honours a different stage list', () => {
    const due = remindersDue(entries, { at: '2024-03-15T08:00', stages: [30], calendar });
    expect(due).toEqual([]);
  });
});

describe('the views over reminders', () => {
  const entries = [
    { ticket: ticket(), locatorId: 'loc-14' },
    { ticket: ticket({ number: 'B240315000421' }) },
  ];
  const due = remindersDue(entries, { at: '2024-03-15T10:00', calendar });

  it('groups by who they go to', () => {
    const grouped = byRecipient(due);
    expect(grouped.map((entry) => entry.locatorId)).toEqual(['LOC-14', 'unassigned']);
  });

  it('writes a line for a nudge and for a breach', () => {
    expect(reminderLine(due[0])).toMatch(/is past its deadline/);
    const early = remindersDue(entries, { at: '2024-03-15T08:30', calendar });
    expect(reminderLine(early[0])).toMatch(/minutes away$/);
  });

  it('keeps only the overdue ones', () => {
    expect(overdueOnly(due)).toHaveLength(2);
    expect(overdueOnly(remindersDue(entries, { at: '2024-03-15T08:30', calendar }))).toEqual([]);
  });

  it('answers whether a stage has gone out', () => {
    expect(alreadySent(due, 'B240315000420', 'overdue')).toBe(true);
    expect(alreadySent(due, 'B240315000420', 60)).toBe(false);
  });
});

describe('beatenByAnswer', () => {
  it('knows when the answer came in first', () => {
    const posted = buildResponse({
      number: 'B240315000420',
      code: '1',
      at: '2024-03-14T09:00',
      by: 'loc-14',
    });
    expect(beatenByAnswer(ticket(), [posted], '2024-03-15T09:00')).toBe(true);
    expect(beatenByAnswer(ticket(), [posted], '2024-03-13T09:00')).toBe(false);
    expect(beatenByAnswer(ticket(), [], '2024-03-15T09:00')).toBe(false);
  });
});
