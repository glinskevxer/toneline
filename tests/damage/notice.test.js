import { describe, expect, it } from 'vitest';
import {
  NOTICE_AUDIENCES,
  centreNotice,
  excavatorNotice,
  regulatorNotice,
  noticesFor,
} from '../../src/damage/notice.js';
import { DamageError, buildDamage } from '../../src/damage/report.js';
import { buildClaim, buildCostSheet } from '../../src/damage/cost.js';

function damage(overrides = {}) {
  return buildDamage({
    id: 'dmg-2024-014',
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
    narrative: 'bucket caught the service tee',
    ...overrides,
  });
}

const ARGS = { operator: 'CTG01' };

describe('centreNotice', () => {
  it('writes the block the centre reads', () => {
    const text = centreNotice(damage(), ARGS);
    expect(text).toContain('DAMAGE: DMG-2024-014');
    expect(text).toContain('MEMBER: CTG01');
    expect(text).toContain('OCCURRED: 03/19/2024 10:25');
    expect(text).toContain('MARKED: Y  ACCURATE: Y');
    expect(text).toContain('SERVICE OUT: Y  CUSTOMERS: 12');
  });

  it('says plainly when there was no ticket', () => {
    expect(centreNotice(damage({ ticketNumber: null }), ARGS)).toContain('TICKET: NONE ON FILE');
  });

  it('says when nobody recorded whether the marks were right', () => {
    expect(centreNotice(damage({ marksAccurate: null }), ARGS)).toContain('ACCURATE: UNKNOWN');
  });

  it('demands the operator code', () => {
    expect(() => centreNotice(damage(), { operator: '' })).toThrow(/operator is required/);
  });
});

describe('excavatorNotice', () => {
  it('says what was hit and what the finding was', () => {
    const text = excavatorNotice(damage(), ARGS);
    expect(text).toContain('a natural gas of ours was struck by backhoe');
    expect(text).toContain('notified on ticket B240315000420');
    expect(text).toContain('excavation:');
    expect(text).toContain('12 customers lost service');
  });

  it('says when no ticket was on file', () => {
    expect(excavatorNotice(damage({ ticketNumber: null }), ARGS)).toContain(
      'We hold no locate ticket'
    );
  });

  it('promises a cost on a recoverable damage', () => {
    expect(excavatorNotice(damage(), ARGS)).toContain('will be put to you once it is known');
  });

  it('names the claim when there is one', () => {
    const sheet = buildCostSheet(damage(), [
      { kind: 'labour', description: 'repair crew', quantity: 8, rate: 64.5 },
    ]);
    const claim = buildClaim(sheet, { raisedOn: '2024-03-25', reference: 'clm-4' });
    expect(excavatorNotice(damage(), { ...ARGS, claim })).toContain('516.00 under claim CLM-4');
  });

  it('charges nothing when the finding was ours', () => {
    const ours = damage({ marksPresent: 'N', marksAccurate: 'N' });
    expect(excavatorNotice(ours, ARGS)).toContain('No cost is being put to you');
  });

  it('leaves the outage line off when nobody lost supply', () => {
    const quiet = damage({ serviceInterrupted: 'N', customersOut: 0 });
    expect(excavatorNotice(quiet, ARGS)).not.toContain('lost service');
  });
});

describe('regulatorNotice', () => {
  it('writes the report for a reportable damage', () => {
    const text = regulatorNotice(damage(), ARGS);
    expect(text).toContain('INCIDENT: DMG-2024-014');
    expect(text).toContain('ROOT CAUSE: EXCAVATION');
    expect(text).toContain('COMMODITY: natural gas');
    expect(text).toContain('NARRATIVE: bucket caught the service tee');
  });

  it('carries the cost when there is a sheet', () => {
    const sheet = buildCostSheet(damage(), [
      { kind: 'labour', description: 'repair crew', quantity: 8, rate: 64.5 },
    ]);
    expect(regulatorNotice(damage(), { ...ARGS, sheet })).toContain('COST: 516.00');
  });

  it('refuses to write one that is not owed', () => {
    const minor = damage({
      facilityType: 'water',
      serviceInterrupted: 'N',
      customersOut: 0,
    });
    expect(() => regulatorNotice(minor, ARGS)).toThrow(DamageError);
    expect(() => regulatorNotice(minor, ARGS)).toThrow(/reporting threshold/);
  });
});

describe('noticesFor', () => {
  it('builds every notice that is owed', () => {
    const result = noticesFor(damage(), ARGS);
    expect(result.owed).toEqual(NOTICE_AUDIENCES);
    expect(result.notices.REGULATOR).toContain('INCIDENT');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('leaves the regulator out when nothing is owed', () => {
    const minor = damage({
      facilityType: 'water',
      serviceInterrupted: 'N',
      customersOut: 0,
    });
    const result = noticesFor(minor, ARGS);
    expect(result.owed).toEqual(['CENTRE', 'EXCAVATOR']);
    expect(result.notices.REGULATOR).toBeNull();
  });
});
