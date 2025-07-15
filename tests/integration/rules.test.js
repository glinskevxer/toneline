import { describe, expect, it } from 'vitest';
import { buildTicket } from '../../src/ticket/record.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildDistricts } from '../../src/network/district.js';
import { screenTicket } from '../../src/screening/screen.js';
import { recommendResponse, recommendByScope } from '../../src/response/decide.js';
import { responseDueAt } from '../../src/response/clock.js';
import { effectiveLawfulStart } from '../../src/ticket/lawfulStart.js';
import { effectiveExpiry } from '../../src/ticket/expiry.js';
import { scoreTicket } from '../../src/ticket/priority.js';
import { assessEscalation } from '../../src/dispatch/escalation.js';
import { Calendar } from '../../src/time/calendar.js';
import { holidayList } from '../../src/time/holidays.js';
import { destination } from '../../src/geo/point.js';

/**
 * The rules in this domain interact, and most of the interactions are the whole
 * point: a ticket type decides a waiting period, the waiting period caps a
 * response clock, the response clock feeds the queue and the queue feeds the
 * escalation. These check the joins rather than the rules on their own.
 */

const calendar = new Calendar({ holidays: holidayList({ preset: 'UTILITY' }) });
const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 300, 90);

const districts = buildDistricts([
  {
    code: 'CENTRAL',
    members: ['CTG01'],
    boundary: [
      { lat: 35.44, lon: -97.56 },
      { lat: 35.48, lon: -97.56 },
      { lat: 35.48, lon: -97.5 },
      { lat: 35.44, lon: -97.5 },
    ],
  },
]);

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240313000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    members: ['CTG01'],
    site: { points: [destination(A, 150, 90)] },
    extent: '10 feet',
    ...overrides,
  });
}

function network(overrides = {}) {
  return buildNetwork([
    { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B], depthFeet: 3, ...overrides },
  ]);
}

describe('the waiting period and the response clock', () => {
  it('caps the clock at the lawful start on a marking ticket', () => {
    const held = ticket();
    expect(responseDueAt(held, { calendar })).toBe(effectiveLawfulStart(held, { calendar }));
  });

  it('does not cap it on a ticket that starts at once', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-13T22:00' });
    expect(responseDueAt(urgent, { calendar })).toBe('2024-03-14T00:00');
    expect(effectiveLawfulStart(urgent, { calendar })).toBe('2024-03-13T22:00');
  });

  it('does not cap it on a ticket that never gets marked', () => {
    const design = ticket({ type: 'DESIGN' });
    expect(responseDueAt(design, { calendar })).not.toBe(
      effectiveLawfulStart(design, { calendar })
    );
  });

  it('pushes the whole chain out over a holiday', () => {
    const before = ticket({ takenAt: '2024-07-02T09:00' });
    const after = ticket({ takenAt: '2024-07-08T09:00' });
    expect(effectiveLawfulStart(before, { calendar })).toBe('2024-07-05T09:00');
    expect(effectiveLawfulStart(after, { calendar })).toBe('2024-07-10T09:00');
  });

  it('runs the life of the ticket from the lawful start, not the call', () => {
    const held = ticket();
    expect(effectiveExpiry(held, { calendar })).toBe('2024-04-04');
    const later = ticket({ takenAt: '2024-03-15T18:00' });
    expect(effectiveExpiry(later, { calendar })).toBe('2024-04-09');
  });
});

describe('the screening and the response code', () => {
  it('asks for a meet on a critical main the dig reaches', () => {
    const result = screenTicket(ticket(), { network: network(), districts });
    expect(recommendResponse(ticket(), result).code).toBe('7');
  });

  it('drops to marks when the bore passes clear underneath', () => {
    const bore = ticket({ boring: true, depthFeet: 14 });
    const result = screenTicket(bore, { network: network(), districts });
    expect(result.depthCleared).toBe(true);
    expect(recommendResponse(bore, result).code).toBe('2');
  });

  it('clears when the same main is abandoned', () => {
    const result = screenTicket(ticket(), { network: network({ abandoned: true }), districts });
    expect(recommendResponse(ticket(), result).code).toBe('8');
  });

  it('answers each facility type on its own terms', () => {
    const mixed = buildNetwork([
      { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B], depthFeet: 3 },
      {
        id: 'WT-1',
        type: 'water',
        district: 'CENTRAL',
        path: [destination(A, 15, 0), destination(B, 15, 0)],
      },
    ]);
    const result = screenTicket(ticket(), { network: mixed, districts });
    const answers = recommendByScope(ticket(), result);
    expect(answers.map((entry) => entry.scope).sort()).toEqual(['GAS', 'WATER']);
    expect(answers.find((entry) => entry.scope === 'GAS').code).toBe('7');
    expect(answers.find((entry) => entry.scope === 'WATER').code).toBe('1');
  });

  it('sends the whole thing back when the ticket is not ours', () => {
    const away = ticket({
      number: 'B240313000421',
      members: ['OKELEC'],
      site: { points: [{ lat: 34, lon: -99 }] },
    });
    const result = screenTicket(away, { network: network(), districts });
    expect(recommendResponse(away, result).code).toBe('9');
  });
});

describe('the queue and the escalation', () => {
  it('puts an emergency at the front whatever the screening says', () => {
    const urgent = ticket({ type: 'EMERGENCY', takenAt: '2024-03-13T08:00' });
    const scored = scoreTicket(urgent, { at: '2024-03-13T08:30', calendar });
    expect(scored.band).toBe('emergency');
  });

  it('lets a deadline overtake a critical conflict', () => {
    const screening = screenTicket(ticket(), { network: network(), districts });
    expect(scoreTicket(ticket(), { at: '2024-03-14T09:00', calendar, screening }).band).toBe(
      'critical'
    );
    expect(scoreTicket(ticket(), { at: '2024-03-15T08:00', calendar, screening }).band).toBe(
      'dueSoon'
    );
  });

  it('escalates a critical conflict nobody has picked up', () => {
    const screening = screenTicket(ticket(), { network: network(), districts });
    const record = assessEscalation(ticket(), { at: '2024-03-14T09:00', calendar, screening });
    expect(record.level).toBe('manager');
  });

  it('stops escalating the moment it is answered', () => {
    const screening = screenTicket(ticket(), { network: network(), districts });
    const record = assessEscalation(ticket(), {
      at: '2024-03-14T09:00',
      calendar,
      screening,
      answered: true,
    });
    expect(record.level).toBe('none');
  });

  it('agrees with the clock about when the deadline is', () => {
    const scored = scoreTicket(ticket(), { at: '2024-03-14T09:00', calendar });
    expect(scored.dueAt).toBe(responseDueAt(ticket(), { calendar }));
  });
});
