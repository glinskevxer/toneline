import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVESTIGATION_POLICY,
  investigationPolicy,
  INVESTIGATION_STEPS,
  buildInvestigation,
  investigationDueOn,
  outstandingSteps,
  investigationStatus,
  chaseList,
  findingLine,
} from '../../src/damage/investigation.js';
import { DamageError, buildDamage } from '../../src/damage/report.js';

function damage(overrides = {}) {
  return buildDamage({
    id: 'dmg-1',
    at: '2024-03-19T10:25',
    ticketNumber: 'B240315000420',
    facilityType: 'gas',
    method: 'backhoe',
    marksPresent: 'Y',
    marksAccurate: 'Y',
    ticketValid: 'Y',
    reportedBy: 'loc-14',
    ...overrides,
  });
}

function investigation(overrides = {}) {
  return buildInvestigation({
    damageId: 'dmg-1',
    openedAt: '2024-03-19T13:00',
    openedBy: 'kmartel',
    ...overrides,
  });
}

describe('buildInvestigation', () => {
  it('builds a frozen record', () => {
    const built = investigation();
    expect(built.damageId).toBe('DMG-1');
    expect(built.steps).toEqual([]);
    expect(built.closedOn).toBeNull();
    expect(Object.isFrozen(built)).toBe(true);
  });

  it('keeps each step once', () => {
    const built = investigation({
      steps: ['site evidence gathered', 'SITE EVIDENCE GATHERED', 'records checked'],
    });
    expect(built.steps).toEqual(['site evidence gathered', 'records checked']);
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildInvestigation(null)).toThrow(DamageError);
  });

  it('rejects a bad opening timestamp or a missing owner', () => {
    expect(() => investigation({ openedAt: '2024-03-19' })).toThrow(/timestamp to open/);
    expect(() => investigation({ openedBy: '' })).toThrow(/openedBy is required/);
  });

  it('rejects a step it does not recognise', () => {
    try {
      investigation({ steps: ['crystal ball consulted'] });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.known).toEqual(INVESTIGATION_STEPS);
    }
  });

  it('refuses to close without a finding or an action', () => {
    expect(() => investigation({ closedOn: '2024-04-01' })).toThrow(/without a finding/);
    expect(() => investigation({ closedOn: '2024-04-01', finding: 'bucket hit the tee' })).toThrow(
      /without an action/
    );
  });

  it('closes with both', () => {
    const closed = investigation({
      closedOn: '2024-04-01',
      finding: 'bucket hit the tee',
      actions: ['retrain the crew on tolerance zones'],
    });
    expect(closed.closedOn).toBe('2024-04-01');
    expect(closed.actions).toHaveLength(1);
  });
});

describe('investigationDueOn', () => {
  it('gives a reportable damage the shorter clock', () => {
    expect(investigationDueOn(damage(), investigation())).toBe('2024-04-17');
  });

  it('gives an ordinary damage the longer one', () => {
    const water = damage({ facilityType: 'water', serviceInterrupted: 'N' });
    expect(investigationDueOn(water, investigation())).toBe('2024-05-17');
  });

  it('honours a tighter policy', () => {
    const policy = investigationPolicy({ reportableDays: 10 });
    expect(investigationDueOn(damage(), investigation(), policy)).toBe('2024-03-28');
    expect(DEFAULT_INVESTIGATION_POLICY.reportableDays).toBe(30);
  });
});

describe('outstandingSteps and investigationStatus', () => {
  it('names what is left to do', () => {
    const partial = investigation({ steps: ['site evidence gathered', 'records checked'] });
    expect(outstandingSteps(partial)).toEqual([
      'ticket history pulled',
      'locator interviewed',
      'excavator interviewed',
    ]);
    expect(outstandingSteps(investigation({ steps: INVESTIGATION_STEPS }))).toEqual([]);
  });

  it('calls an open investigation open while there is time', () => {
    const status = investigationStatus(damage(), investigation(), '2024-04-01');
    expect(status.state).toBe('open');
    expect(status.daysLeft).toBe(16);
  });

  it('calls it overdue once the clock runs out', () => {
    const status = investigationStatus(damage(), investigation(), '2024-04-20');
    expect(status.state).toBe('overdue');
    expect(status.daysLeft).toBe(-3);
  });

  it('calls a closed investigation closed', () => {
    const closed = investigation({
      closedOn: '2024-04-01',
      finding: 'x',
      actions: ['y'],
    });
    expect(investigationStatus(damage(), closed, '2024-05-01').state).toBe('closed');
  });

  it('marks one closed after the clock as closed late', () => {
    const closed = investigation({
      closedOn: '2024-04-20',
      finding: 'x',
      actions: ['y'],
    });
    expect(investigationStatus(damage(), closed, '2024-05-01').state).toBe('closed late');
  });
});

describe('chaseList', () => {
  const entries = [
    { damage: damage(), investigation: investigation() },
    {
      damage: damage({ id: 'dmg-2' }),
      investigation: investigation({ damageId: 'dmg-2', openedAt: '2024-02-01T09:00' }),
    },
    {
      damage: damage({ id: 'dmg-3' }),
      investigation: investigation({
        damageId: 'dmg-3',
        closedOn: '2024-03-25',
        finding: 'x',
        actions: ['y'],
      }),
    },
  ];

  it('chases the overdue and the nearly due, worst first', () => {
    const chase = chaseList(entries, '2024-04-12');
    expect(chase.map((entry) => entry.damageId)).toEqual(['DMG-2', 'DMG-1']);
    expect(chase[0].state).toBe('overdue');
  });

  it('leaves closed investigations alone', () => {
    expect(chaseList(entries, '2024-04-12').map((entry) => entry.damageId)).not.toContain('DMG-3');
  });

  it('chases nothing when there is time on everything', () => {
    expect(chaseList(entries.slice(0, 1), '2024-03-20')).toEqual([]);
  });
});

describe('findingLine', () => {
  it('puts the cause and the finding on one line', () => {
    const closed = investigation({
      closedOn: '2024-04-01',
      finding: 'the bucket went through marked plant',
      actions: ['retrain'],
    });
    expect(findingLine(damage(), closed)).toBe(
      'DMG-1 EXCAVATION: the bucket went through marked plant'
    );
  });

  it('says so when there is no finding yet', () => {
    expect(findingLine(damage(), investigation())).toMatch(/no finding yet$/);
  });
});
