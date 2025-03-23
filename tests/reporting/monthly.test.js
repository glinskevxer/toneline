import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inMonth, monthlyPack, packHeadlines, packLines } from '../../src/reporting/monthly.js';
import { openDesk, readFeed } from '../../src/cli/context.js';
import { schedulingContext } from '../../src/config/load.js';
import { answerBatch } from '../../src/response/session.js';
import { evaluateBatch } from '../../src/response/compliance.js';
import { readDamageCsv } from '../../src/io/damages.js';
import { readText } from '../../src/io/files.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const desk = openDesk(join(examples, 'cross-timbers.json')).desk;
const tickets = readFeed(join(examples, 'march-2024.feed')).tickets;
const damages = readDamageCsv(readText(join(examples, 'damages-2024.csv'))).damages;

const session = answerBatch(tickets, { desk, at: '2024-03-20T08:00', by: 'desk' });
const compliance = evaluateBatch(
  tickets.map((ticket) => ({ ticket, responses: session.postings })),
  { at: '2024-03-21T08:00', ...schedulingContext(desk) }
);

function pack(period = '2024-03') {
  return monthlyPack({
    period,
    desk,
    tickets,
    responses: session.postings,
    compliance,
    damages,
  });
}

describe('inMonth', () => {
  it('matches on the month', () => {
    expect(inMonth('2024-03-15T09:00', '2024-03')).toBe(true);
    expect(inMonth('2024-04-01T09:00', '2024-03')).toBe(false);
  });
});

describe('monthlyPack', () => {
  it('counts only the tickets received in the month', () => {
    expect(pack().tickets).toBe(4);
    expect(pack('2024-04').tickets).toBe(0);
  });

  it('carries the indicators and the compliance summary', () => {
    const result = pack();
    expect(result.indicators.tickets).toBe(4);
    expect(result.compliance.tickets).toBe(4);
    expect(result.operator).toBe('Cross Timbers Gas and Water');
  });

  it('counts only the damages in the month', () => {
    expect(pack().damages.damages).toBe(1);
    expect(pack('2024-04').damages.damages).toBe(2);
  });

  it('bills and credits the month', () => {
    const result = pack();
    expect(result.invoice.lines).toBeGreaterThan(0);
    expect(result.invoice.payable).toBeLessThanOrEqual(result.invoice.total);
  });

  it('reports what came in badly', () => {
    const result = pack();
    expect(result.incoming.cleanShare).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.incoming.worst)).toBe(true);
  });

  it('packs an empty month without dividing by zero', () => {
    const empty = pack('2024-09');
    expect(empty.tickets).toBe(0);
    expect(empty.incoming.cleanShare).toBe(1);
    expect(empty.indicators.onTimeRate).toBe(0);
  });

  it('refuses a period that is not a month', () => {
    expect(() =>
      monthlyPack({ period: 'march', desk, tickets, responses: [], compliance: [] })
    ).toThrow(TypeError);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(pack())).toBe(true);
  });
});

describe('packHeadlines and packLines', () => {
  it('reduces the pack to the front page', () => {
    const headlines = packHeadlines(pack());
    expect(headlines.tickets).toBe(4);
    expect(headlines).toHaveProperty('damageRate');
    expect(headlines).toHaveProperty('payable');
  });

  it('writes the pack out line by line', () => {
    const lines = packLines(pack());
    expect(lines[0]).toBe('Cross Timbers Gas and Water, 2024-03');
    expect(lines[1]).toMatch(/^4 tickets, \d+ answered, \d+ late$/);
    expect(lines[2]).toMatch(/^on time \d+\.\d per cent$/);
    expect(lines).toHaveLength(6);
  });
});
