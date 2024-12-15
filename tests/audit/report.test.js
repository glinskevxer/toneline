import { describe, expect, it } from 'vitest';
import {
  EXPECTED_ACTIONS,
  ticketStory,
  actorActivity,
  dailyVolume,
  gaps,
  subjectsIn,
} from '../../src/audit/report.js';
import { AuditTrail } from '../../src/audit/trail.js';

function trail() {
  return new AuditTrail([
    { at: '2024-03-15T07:45', subject: 'B240315000420', action: 'received', by: 'feed' },
    { at: '2024-03-15T08:00', subject: 'B240315000420', action: 'screened', by: 'kmartel' },
    { at: '2024-03-15T08:30', subject: 'B240315000420', action: 'assigned', by: 'dispatch' },
    { at: '2024-03-16T09:40', subject: 'B240315000420', action: 'responded', by: 'loc-14' },
    { at: '2024-03-15T07:46', subject: 'B240315000421', action: 'received', by: 'feed' },
    { at: '2024-03-15T08:05', subject: 'B240315000421', action: 'screened', by: 'kmartel' },
  ]);
}

describe('ticketStory', () => {
  it('tells the story in order', () => {
    const story = ticketStory(trail(), 'b240315000420');
    expect(story.number).toBe('B240315000420');
    expect(story.entries).toBe(4);
    expect(story.lines[0]).toContain('received by feed');
    expect(story.lines[3]).toContain('responded by loc-14');
  });

  it('names everyone who touched it', () => {
    expect(ticketStory(trail(), 'B240315000420').actors).toEqual([
      'dispatch',
      'feed',
      'kmartel',
      'loc-14',
    ]);
  });

  it('measures how long it took', () => {
    const story = ticketStory(trail(), 'B240315000420');
    expect(story.firstAt).toBe('2024-03-15T07:45');
    expect(story.lastAt).toBe('2024-03-16T09:40');
    expect(story.minutesSpanned).toBe(1555);
  });

  it('says what is missing', () => {
    const story = ticketStory(trail(), 'B240315000421');
    expect(story.complete).toBe(false);
    expect(story.missing).toEqual(['assigned', 'responded']);
  });

  it('calls a full story complete', () => {
    expect(ticketStory(trail(), 'B240315000420').complete).toBe(true);
  });

  it('tells an empty story about a ticket it does not know', () => {
    const story = ticketStory(trail(), 'B240315000999');
    expect(story.entries).toBe(0);
    expect(story.firstAt).toBeNull();
    expect(story.minutesSpanned).toBe(0);
    expect(story.missing).toEqual(EXPECTED_ACTIONS);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(ticketStory(trail(), 'B240315000420'))).toBe(true);
  });
});

describe('actorActivity', () => {
  it('counts what each person did', () => {
    const activity = actorActivity(trail(), '2024-03-15T00:00', '2024-03-16T23:59');
    const kmartel = activity.find((entry) => entry.actor === 'kmartel');
    expect(kmartel.actions).toEqual({ screened: 2 });
    expect(kmartel.total).toBe(2);
  });

  it('sorts the actors', () => {
    const activity = actorActivity(trail(), '2024-03-15T00:00', '2024-03-16T23:59');
    expect(activity.map((entry) => entry.actor)).toEqual(['dispatch', 'feed', 'kmartel', 'loc-14']);
  });

  it('honours the window', () => {
    const activity = actorActivity(trail(), '2024-03-16T00:00', '2024-03-16T23:59');
    expect(activity.map((entry) => entry.actor)).toEqual(['loc-14']);
  });

  it('counts nothing outside the window', () => {
    expect(actorActivity(trail(), '2024-04-01T00:00', '2024-04-02T00:00')).toEqual([]);
  });
});

describe('dailyVolume', () => {
  it('counts by day in order', () => {
    expect(dailyVolume(trail(), '2024-03-15T00:00', '2024-03-16T23:59')).toEqual([
      { day: '2024-03-15', entries: 5 },
      { day: '2024-03-16', entries: 1 },
    ]);
  });
});

describe('gaps and subjectsIn', () => {
  it('names the tickets with something missing', () => {
    expect(gaps(trail(), ['B240315000420', 'B240315000421'])).toEqual([
      { number: 'B240315000421', missing: ['assigned', 'responded'] },
    ]);
  });

  it('finds nothing wrong with a complete trail', () => {
    expect(gaps(trail(), ['B240315000420'])).toEqual([]);
  });

  it('lists the subjects it knows about', () => {
    expect(subjectsIn(trail())).toEqual(['B240315000420', 'B240315000421']);
    expect(subjectsIn(new AuditTrail())).toEqual([]);
  });
});
