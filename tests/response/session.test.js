import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  answerTicket,
  answerBatch,
  postingsByTicket,
  sessionSummary,
} from '../../src/response/session.js';
import { openDesk, readFeed } from '../../src/cli/context.js';
import { buildTicket } from '../../src/ticket/record.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const desk = openDesk(join(examples, 'cross-timbers.json')).desk;
const tickets = readFeed(join(examples, 'march-2024.feed')).tickets;

const ARGS = { desk, at: '2024-03-14T08:00', by: 'kmartel' };

describe('answerTicket', () => {
  it('posts one entry per facility type found', () => {
    const { postings } = answerTicket(tickets[0], ARGS);
    expect(postings.length).toBeGreaterThan(1);
    expect(new Set(postings.map((posting) => posting.scope)).size).toBe(postings.length);
  });

  it('dates the marks from the mark life policy', () => {
    const { postings } = answerTicket(tickets[0], ARGS);
    const marked = postings.find((posting) => posting.marksThrough !== null);
    expect(marked.marksThrough).toBe('2024-03-27');
  });

  it('leaves no marks date on a code that needs none', () => {
    const { postings } = answerTicket(tickets[3], ARGS);
    expect(postings[0].code).toBe('9');
    expect(postings[0].marksThrough).toBeNull();
  });

  it('books a meet on the next business day', () => {
    const { postings } = answerTicket(tickets[2], { ...ARGS, at: '2024-03-15T10:00' });
    const meet = postings.find((posting) => posting.meetAt !== null);
    expect(meet.meetAt).toBe('2024-03-18T08:00');
  });

  it('honours a different meet time and offset', () => {
    const { postings } = answerTicket(tickets[2], {
      ...ARGS,
      at: '2024-03-15T10:00',
      meetTime: '13:30',
      meetOffsetDays: 5,
    });
    const meet = postings.find((posting) => posting.meetAt !== null);
    expect(meet.meetAt).toBe('2024-03-20T13:30');
  });

  it('carries the reason onto the posting', () => {
    const { postings } = answerTicket(tickets[3], ARGS);
    expect(postings[0].note).toMatch(/outside every district/);
  });

  it('hands the screening back with the postings', () => {
    const { screening } = answerTicket(tickets[0], ARGS);
    expect(screening.number).toBe('B240313000418');
  });
});

describe('answerBatch', () => {
  it('answers every ticket in the feed', () => {
    const session = answerBatch(tickets, ARGS);
    expect(session.screenings).toHaveLength(4);
    expect(session.postings.length).toBeGreaterThan(4);
    expect(session.held).toEqual([]);
  });

  it('holds a ticket it cannot place at all', () => {
    const bare = buildTicket({
      number: 'B240315000999',
      type: 'NORMAL',
      takenAt: '2024-03-15T09:00',
      address: 'somewhere with no grids',
      members: ['OKELEC'],
    });
    const session = answerBatch([bare], ARGS);
    expect(session.postings).toEqual([]);
    expect(session.held).toEqual([
      { number: 'B240315000999', reason: 'no geometry and no member code of ours' },
    ]);
  });

  it('still answers a bare ticket that carries one of our member codes', () => {
    const ours = buildTicket({
      number: 'B240315000998',
      type: 'NORMAL',
      takenAt: '2024-03-15T09:00',
      address: 'somewhere with no grids',
      members: ['CTG01'],
    });
    const session = answerBatch([ours], ARGS);
    expect(session.held).toEqual([]);
    expect(session.postings[0].code).toBe('6');
  });
});

describe('postingsByTicket and sessionSummary', () => {
  const session = answerBatch(tickets, ARGS);

  it('groups the postings by ticket', () => {
    const grouped = postingsByTicket(session.postings);
    expect(grouped.get('B240313000418').length).toBeGreaterThan(1);
    expect(grouped.size).toBe(4);
  });

  it('summarises the session', () => {
    const summary = sessionSummary(session);
    expect(summary.tickets).toBe(4);
    expect(summary.held).toBe(0);
    expect(summary.conflicts).toBeGreaterThan(0);
    expect(Object.keys(summary.codes).length).toBeGreaterThan(1);
  });
});
