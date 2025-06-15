import { describe, expect, it } from 'vitest';
import {
  EXCEPTION_WEIGHTS,
  exceptionRow,
  exceptionReport,
  nextActions,
  ofKind,
  exceptionLines,
} from '../../src/reporting/exceptions.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildDamageRegister } from '../../src/damage/register.js';
import { buildDamage } from '../../src/damage/report.js';
import { buildInvestigation } from '../../src/damage/investigation.js';
import { Calendar } from '../../src/time/calendar.js';
import { destination } from '../../src/geo/point.js';

const calendar = new Calendar();
const A = { lat: 35.4676, lon: -97.5164 };

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-13T09:00',
    address: '1420 NW 23RD ST',
    extent: 'east 120 feet from the driveway',
    excavator: { company: 'Digwell', phone: '405-555-0148' },
    members: ['CTG01'],
    site: { points: [A] },
    ...overrides,
  });
}

const COMPLIANCE = [
  { number: 'B240315000420', status: 'late', minutesLate: 120, answered: true, complete: true },
  {
    number: 'B240315000421',
    status: 'compliant',
    minutesLate: -10,
    answered: true,
    complete: true,
  },
];

const DAMAGE_ROWS = buildDamageRegister(
  [
    {
      damage: buildDamage({
        id: 'dmg-1',
        at: '2024-03-19T10:25',
        facilityType: 'gas',
        reportedBy: 'loc-1',
      }),
      investigation: buildInvestigation({
        damageId: 'dmg-1',
        openedAt: '2024-03-19T13:00',
        openedBy: 'kmartel',
      }),
    },
  ],
  { at: '2024-04-01T09:00' }
);

describe('exceptionRow', () => {
  it('weighs a row by its kind', () => {
    expect(exceptionRow({ kind: 'escalation', subject: 'b1', summary: 'x' }).weight).toBe(0);
    expect(exceptionRow({ kind: 'plant', subject: 'b1', summary: 'x' }).weight).toBe(40);
  });

  it('falls back for a kind it does not know', () => {
    expect(exceptionRow({ kind: 'weather', subject: 'b1', summary: 'x' }).weight).toBe(99);
  });

  it('takes a weight it was given', () => {
    expect(exceptionRow({ kind: 'plant', subject: 'b1', summary: 'x', weight: 1 }).weight).toBe(1);
  });

  it('upper cases the subject and freezes the row', () => {
    const row = exceptionRow({ kind: 'ticket', subject: 'b1', summary: 'x' });
    expect(row.subject).toBe('B1');
    expect(Object.isFrozen(row)).toBe(true);
  });
});

describe('exceptionReport', () => {
  it('gathers nothing from nothing', () => {
    const report = exceptionReport();
    expect(report.total).toBe(0);
    expect(report.counts).toEqual({
      escalation: 0,
      compliance: 0,
      damage: 0,
      ticket: 0,
      plant: 0,
    });
  });

  it('gathers the compliance exceptions', () => {
    const report = exceptionReport({ compliance: COMPLIANCE });
    expect(report.total).toBe(1);
    expect(report.rows[0].kind).toBe('compliance');
    expect(report.rows[0].detail).toBe('120 minutes late');
  });

  it('gathers the ticket warnings', () => {
    const report = exceptionReport({ tickets: [ticket({ members: [] })] });
    expect(ofKind(report, 'ticket')).toHaveLength(1);
  });

  it('gathers the open damages', () => {
    const report = exceptionReport({ damageRows: DAMAGE_ROWS });
    expect(ofKind(report, 'damage')[0].summary).toMatch(/investigation/);
  });

  it('gathers the plant problems', () => {
    const network = buildNetwork([{ id: 'GM-1', type: 'gas', path: [A, destination(A, 200, 90)] }]);
    expect(ofKind(exceptionReport({ network }), 'plant')).toHaveLength(1);
  });

  it('gathers the escalations when it has a moment to judge them at', () => {
    const entries = [{ ticket: ticket() }];
    const report = exceptionReport({ entries, at: '2024-03-15T12:00', calendar });
    expect(ofKind(report, 'escalation')).toHaveLength(1);
    expect(exceptionReport({ entries }).total).toBe(0);
  });

  it('ranks the escalations above everything else', () => {
    const report = exceptionReport({
      entries: [{ ticket: ticket() }],
      at: '2024-03-15T12:00',
      calendar,
      compliance: COMPLIANCE,
      tickets: [ticket({ members: [] })],
      damageRows: DAMAGE_ROWS,
    });
    expect(report.rows[0].kind).toBe('escalation');
    expect(report.rows[report.rows.length - 1].kind).toBe('ticket');
    expect(report.total).toBeGreaterThan(3);
  });

  it('counts every kind it gathered', () => {
    const report = exceptionReport({ compliance: COMPLIANCE, damageRows: DAMAGE_ROWS });
    expect(report.counts.compliance).toBe(1);
    expect(report.counts.damage).toBe(1);
    expect(report.counts.plant).toBe(0);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(exceptionReport({ compliance: COMPLIANCE }))).toBe(true);
    expect(EXCEPTION_WEIGHTS.escalation).toBe(0);
  });
});

describe('the views over the report', () => {
  const report = exceptionReport({ compliance: COMPLIANCE, damageRows: DAMAGE_ROWS });

  it('takes the head of the list', () => {
    expect(nextActions(report, 1)).toHaveLength(1);
    expect(nextActions(report, 0)).toEqual([]);
    expect(nextActions(report)).toHaveLength(2);
  });

  it('writes a line per row', () => {
    const lines = exceptionLines(report);
    expect(lines[0]).toBe('B240315000420: late (120 minutes late)');
  });

  it('leaves the bracket off when there is no detail', () => {
    const bare = exceptionReport({
      compliance: [{ number: 'B1', status: 'missed', minutesLate: null, answered: false }],
    });
    expect(exceptionLines(bare)[0]).toBe('B1: missed');
  });
});
