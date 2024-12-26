import { describe, expect, it } from 'vitest';
import {
  damageRow,
  buildDamageRegister,
  writeDamageRegisterCsv,
  openDamages,
  registerTotals,
} from '../../src/damage/register.js';
import { buildDamage } from '../../src/damage/report.js';
import { buildCostSheet } from '../../src/damage/cost.js';
import { buildInvestigation } from '../../src/damage/investigation.js';
import { parseCsv } from '../../src/io/csv.js';

function damage(overrides = {}) {
  return buildDamage({
    id: 'dmg-1',
    at: '2024-03-19T10:25',
    ticketNumber: 'B240315000420',
    facilityId: 'GM-1',
    facilityType: 'gas',
    excavator: 'Digwell Excavating',
    method: 'backhoe',
    marksPresent: 'Y',
    marksAccurate: 'Y',
    ticketValid: 'Y',
    serviceInterrupted: 'Y',
    customersOut: 12,
    reportedBy: 'loc-14',
    ...overrides,
  });
}

const LINES = [{ kind: 'labour', description: 'repair crew', quantity: 8, rate: 64.5 }];

function investigation(overrides = {}) {
  return buildInvestigation({
    damageId: 'dmg-1',
    openedAt: '2024-03-19T13:00',
    openedBy: 'kmartel',
    ...overrides,
  });
}

describe('damageRow', () => {
  it('carries the facts and the coding', () => {
    const row = damageRow(damage());
    expect(row.id).toBe('DMG-1');
    expect(row.cause).toBe('EXCAVATION');
    expect(row.responsible).toBe('excavator');
    expect(row.reportable).toBe(true);
    expect(Object.isFrozen(row)).toBe(true);
  });

  it('leaves the cost columns empty with no sheet', () => {
    const row = damageRow(damage());
    expect(row.cost).toBeNull();
    expect(row.recoverableCost).toBeNull();
  });

  it('carries the cost when there is a sheet', () => {
    const row = damageRow(damage(), { sheet: buildCostSheet(damage(), LINES) });
    expect(row.cost).toBe(516);
    expect(row.recoverableCost).toBe(516);
  });

  it('carries the investigation state when there is one and a date', () => {
    const row = damageRow(damage(), { investigation: investigation(), at: '2024-04-01T09:00' });
    expect(row.investigation).toBe('open');
    expect(row.investigationDue).toBe('2024-04-17');
  });

  it('leaves the investigation empty without a date to judge it on', () => {
    expect(damageRow(damage(), { investigation: investigation() }).investigation).toBeNull();
  });
});

describe('buildDamageRegister', () => {
  const entries = [
    { damage: damage({ id: 'dmg-2', at: '2024-03-20T08:00' }) },
    { damage: damage(), sheet: buildCostSheet(damage(), LINES), investigation: investigation() },
  ];

  it('sorts oldest first', () => {
    const rows = buildDamageRegister(entries, { at: '2024-04-01T09:00' });
    expect(rows.map((row) => row.id)).toEqual(['DMG-1', 'DMG-2']);
  });

  it('carries each entry its own sheet and investigation', () => {
    const rows = buildDamageRegister(entries, { at: '2024-04-01T09:00' });
    expect(rows[0].cost).toBe(516);
    expect(rows[1].cost).toBeNull();
    expect(rows[1].investigation).toBeNull();
  });

  it('builds nothing from nothing', () => {
    expect(buildDamageRegister([])).toEqual([]);
  });
});

describe('writeDamageRegisterCsv', () => {
  it('writes the centre timestamp and the flags', () => {
    const rows = buildDamageRegister([{ damage: damage() }]);
    const parsed = parseCsv(writeDamageRegisterCsv(rows));
    expect(parsed[0].at).toBe('03/19/2024 10:25');
    expect(parsed[0].reportable).toBe('Y');
    expect(parsed[0].injury).toBe('N');
    expect(parsed[0].cause).toBe('EXCAVATION');
  });

  it('writes a header with no rows', () => {
    expect(writeDamageRegisterCsv([]).split('\n')[0]).toContain('id,at,ticket');
  });
});

describe('openDamages and registerTotals', () => {
  const rows = buildDamageRegister(
    [
      { damage: damage(), investigation: investigation() },
      {
        damage: damage({ id: 'dmg-2', marksPresent: 'N', marksAccurate: 'N' }),
        sheet: buildCostSheet(damage({ marksPresent: 'N', marksAccurate: 'N' }), LINES),
        investigation: investigation({
          damageId: 'dmg-2',
          openedAt: '2024-02-01T09:00',
        }),
      },
    ],
    { at: '2024-04-01T09:00' }
  );

  it('lists the investigations still running, soonest due first', () => {
    expect(openDamages(rows).map((row) => row.id)).toEqual(['DMG-2', 'DMG-1']);
  });

  it('adds the register up', () => {
    const totals = registerTotals(rows);
    expect(totals.damages).toBe(2);
    expect(totals.reportable).toBe(2);
    expect(totals.ourFault).toBe(1);
    expect(totals.cost).toBe(516);
    expect(totals.recoverable).toBe(0);
    expect(totals.customersOut).toBe(24);
  });

  it('adds an empty register up to nothing', () => {
    expect(registerTotals([]).cost).toBe(0);
  });
});
