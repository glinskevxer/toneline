import { describe, expect, it } from 'vitest';
import {
  registerRow,
  buildRegister,
  writeRegisterCsv,
  registerExceptions,
  responseCodeCounts,
} from '../../src/reporting/register.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildResponse } from '../../src/response/post.js';
import { evaluateCompliance } from '../../src/response/compliance.js';
import { buildDamage } from '../../src/damage/report.js';
import { parseCsv } from '../../src/io/csv.js';
import { Calendar } from '../../src/time/calendar.js';

const calendar = new Calendar();

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    place: 'Oklahoma City',
    excavator: { company: 'Digwell Excavating' },
    ...overrides,
  });
}

const RESPONSES = [
  buildResponse({
    number: 'B240315000420',
    code: '2',
    at: '2024-03-14T09:00',
    by: 'loc-1',
    marksThrough: '2024-03-27',
  }),
];

const SCREENING = {
  districts: ['CENTRAL'],
  hits: [{ type: 'GAS', insideTolerance: true, abandoned: false }],
  conflict: true,
};

describe('registerRow', () => {
  it('gathers what the regulator asks for', () => {
    const row = registerRow(ticket(), {
      responses: RESPONSES,
      screening: SCREENING,
      calendar,
    });
    expect(row.number).toBe('B240315000420');
    expect(row.lawfulStartAt).toBe('2024-03-15T09:00');
    expect(row.expiresOn).toBe('2024-04-04');
    expect(row.districts).toEqual(['CENTRAL']);
    expect(row.facilitiesFound).toBe(1);
    expect(row.conflict).toBe(true);
    expect(row.responseCode).toBe('2');
    expect(row.excavator).toBe('Digwell Excavating');
    expect(Object.isFrozen(row)).toBe(true);
  });

  it('leaves the screening columns empty when there was none', () => {
    const row = registerRow(ticket(), { responses: RESPONSES, calendar });
    expect(row.districts).toEqual([]);
    expect(row.facilitiesFound).toBeNull();
    expect(row.conflict).toBeNull();
  });

  it('leaves the response columns empty when nothing was posted', () => {
    const row = registerRow(ticket(), { calendar });
    expect(row.responseCode).toBeNull();
    expect(row.respondedAt).toBeNull();
  });

  it('ignores a posting against another ticket', () => {
    const other = buildResponse({ ...RESPONSES[0], number: 'B240315000421' });
    expect(registerRow(ticket(), { responses: [other], calendar }).responseCode).toBeNull();
  });

  it('carries the compliance verdict when there is one', () => {
    const held = ticket();
    const compliance = evaluateCompliance(held, {
      responses: RESPONSES,
      at: '2024-03-16T09:00',
      calendar,
    });
    const row = registerRow(held, { responses: RESPONSES, compliance, calendar });
    expect(row.onTime).toBe(true);
    expect(row.minutesLate).toBeLessThan(0);
  });

  it('counts damages against the ticket', () => {
    const damages = [
      buildDamage({
        id: 'd1',
        at: '2024-03-19T10:25',
        ticketNumber: 'B240315000420',
        facilityType: 'gas',
        reportedBy: 'loc-1',
      }),
      buildDamage({
        id: 'd2',
        at: '2024-03-19T10:25',
        ticketNumber: 'B240315000999',
        facilityType: 'gas',
        reportedBy: 'loc-1',
      }),
    ];
    expect(registerRow(ticket(), { damages, calendar }).damages).toBe(1);
  });

  it('copes with a ticket carrying no excavator', () => {
    expect(registerRow(ticket({ excavator: null }), { calendar }).excavator).toBeNull();
  });
});

describe('buildRegister', () => {
  it('sorts oldest first', () => {
    const rows = buildRegister(
      [ticket({ number: 'B240315000421' }), ticket({ takenAt: '2024-03-12T09:00' })],
      { calendar }
    );
    expect(rows.map((row) => row.number)).toEqual(['B240315000420', 'B240315000421']);
  });

  it('builds nothing from nothing', () => {
    expect(buildRegister([], { calendar })).toEqual([]);
  });
});

describe('writeRegisterCsv', () => {
  it('writes the centre formats back out', () => {
    const rows = buildRegister([ticket()], {
      responses: RESPONSES,
      screening: SCREENING,
      calendar,
    });
    const parsed = parseCsv(writeRegisterCsv(rows));
    expect(parsed[0].taken).toBe('03/13/2024 09:00');
    expect(parsed[0].lawful_start).toBe('03/15/2024 09:00');
    expect(parsed[0].expires).toBe('04/04/2024');
    expect(parsed[0].conflict).toBe('Y');
    expect(parsed[0].districts).toBe('CENTRAL');
  });

  it('leaves unknown flags blank rather than guessing', () => {
    const rows = buildRegister([ticket()], { calendar });
    const parsed = parseCsv(writeRegisterCsv(rows));
    expect(parsed[0].conflict).toBe('');
    expect(parsed[0].on_time).toBe('');
    expect(parsed[0].responded).toBe('');
  });

  it('writes a header even with no rows', () => {
    expect(writeRegisterCsv([]).split('\n')[0]).toContain('ticket,type,status');
  });
});

describe('register views', () => {
  const rows = [
    { number: 'B1', damages: 0, onTime: true, responseCode: '2' },
    { number: 'B2', damages: 1, onTime: true, responseCode: '2' },
    { number: 'B3', damages: 0, onTime: false, responseCode: '1' },
    { number: 'B4', damages: 0, onTime: null, responseCode: null },
  ];

  it('picks out what a reviewer has to look at', () => {
    expect(registerExceptions(rows).map((row) => row.number)).toEqual(['B2', 'B3', 'B4']);
  });

  it('counts the response codes with a bucket for none', () => {
    expect(responseCodeCounts(rows)).toEqual({ 2: 2, 1: 1, none: 1 });
  });
});
