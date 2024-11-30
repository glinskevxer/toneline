import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrief, briefHeadline, isQuiet, briefNumbers } from '../../src/reporting/brief.js';
import { openDesk, readFeed } from '../../src/cli/context.js';
import { buildAssignment } from '../../src/dispatch/assign.js';
import { buildResponse } from '../../src/response/post.js';
import { buildDamage } from '../../src/damage/report.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const desk = openDesk(join(examples, 'cross-timbers.json')).desk;
const tickets = readFeed(join(examples, 'march-2024.feed')).tickets;

function brief(overrides = {}) {
  return buildBrief({ desk, tickets, at: '2024-03-15T09:00', ...overrides });
}

describe('buildBrief', () => {
  it('counts what is open', () => {
    const morning = brief();
    expect(morning.open).toBe(4);
    expect(morning.held).toBe(0);
    expect(morning.operator).toBe('Cross Timbers Gas and Water');
    expect(morning.date).toBe('2024-03-15');
  });

  it('counts the ageing buckets and the queue bands', () => {
    const morning = brief();
    expect(Object.keys(morning.buckets)).toContain('breached');
    expect(Object.keys(morning.bands)).toContain('emergency');
  });

  it('names the breached tickets', () => {
    expect(brief().breached.length).toBeGreaterThan(0);
  });

  it('counts what nobody is holding', () => {
    const held = buildAssignment({
      number: 'B240313000418',
      locatorId: 'loc-1',
      at: '2024-03-14T08:00',
      by: 'dispatch',
    });
    expect(brief({ assignments: [held] }).unassigned).toBe(3);
    expect(brief().unassigned).toBe(4);
  });

  it('leaves an answered ticket out of the escalations', () => {
    const posted = buildResponse({
      number: 'B240313000418',
      code: '2',
      at: '2024-03-14T09:00',
      by: 'loc-1',
      marksThrough: '2024-03-28',
    });
    const withPosting = brief({ responses: [posted] });
    expect(withPosting.escalations.map((entry) => entry.number)).not.toContain('B240313000418');
    expect(brief().escalations.map((entry) => entry.number)).toContain('B240313000418');
  });

  it('counts damages on the day of the brief only', () => {
    const damages = [
      buildDamage({ id: 'd1', at: '2024-03-15T08:00', facilityType: 'gas', reportedBy: 'x' }),
      buildDamage({ id: 'd2', at: '2024-03-14T08:00', facilityType: 'gas', reportedBy: 'x' }),
    ];
    expect(brief({ damages }).damagesToday).toBe(1);
  });

  it('keeps the queue to the head of the list', () => {
    expect(brief().queue.length).toBeLessThanOrEqual(10);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(brief())).toBe(true);
  });
});

describe('brief views', () => {
  it('writes a headline', () => {
    expect(briefHeadline(brief())).toMatch(/^4 open, \d+ breached, \d+ to escalate$/);
  });

  it('says so when there is nothing to escalate', () => {
    const early = buildBrief({ desk, tickets: [], at: '2024-03-15T09:00' });
    expect(briefHeadline(early)).toContain('nothing to escalate');
    expect(isQuiet(early)).toBe(true);
  });

  it('is not quiet when something has breached', () => {
    expect(isQuiet(brief())).toBe(false);
  });

  it('reduces the brief to the numbers worth trending', () => {
    const numbers = briefNumbers(brief());
    expect(numbers.open).toBe(4);
    expect(numbers).toHaveProperty('dueWithinTheHour');
    expect(numbers).toHaveProperty('escalations');
  });
});
