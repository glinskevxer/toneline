import { describe, expect, it } from 'vitest';
import {
  ROOT_CAUSES,
  rootCause,
  classifyDamage,
  isRecoverable,
  causeCounts,
  operatorShare,
} from '../../src/damage/rootCause.js';
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

describe('rootCause', () => {
  it('lists the families', () => {
    expect(ROOT_CAUSES).toEqual(['NOTIFICATION', 'LOCATING', 'EXCAVATION', 'MISCELLANEOUS']);
  });

  it('looks a family up in any case', () => {
    expect(rootCause('locating').responsible).toBe('operator');
  });

  it('rejects anything else', () => {
    expect(() => rootCause('weather')).toThrow(DamageError);
    expect(() => rootCause(null)).toThrow(/not one of the families/);
  });
});

describe('classifyDamage', () => {
  it('blames notification when there was no ticket', () => {
    const verdict = classifyDamage(damage({ ticketNumber: null }));
    expect(verdict.code).toBe('NOTIFICATION');
    expect(verdict.responsible).toBe('excavator');
    expect(verdict.recoverable).toBe(true);
  });

  it('blames notification when the ticket was not valid', () => {
    expect(classifyDamage(damage({ ticketValid: 'N' })).code).toBe('NOTIFICATION');
  });

  it('puts an unmarked site on the operator whatever the digging was like', () => {
    const verdict = classifyDamage(damage({ marksPresent: 'N', marksAccurate: 'N' }));
    expect(verdict.code).toBe('LOCATING');
    expect(verdict.recoverable).toBe(false);
  });

  it('puts wrong marks on the operator too', () => {
    const verdict = classifyDamage(damage({ marksAccurate: 'N' }));
    expect(verdict.code).toBe('LOCATING');
    expect(verdict.reason).toMatch(/wrong place/);
  });

  it('blames the excavation when the marks were right', () => {
    const verdict = classifyDamage(damage());
    expect(verdict.code).toBe('EXCAVATION');
    expect(verdict.recoverable).toBe(true);
  });

  it('leaves careful digging with correct marks unassigned', () => {
    expect(classifyDamage(damage({ method: 'hand' })).code).toBe('MISCELLANEOUS');
    expect(classifyDamage(damage({ method: 'vacuum' })).code).toBe('MISCELLANEOUS');
  });

  it('puts notification ahead of everything else', () => {
    const verdict = classifyDamage(
      damage({ ticketValid: 'N', marksPresent: 'N', marksAccurate: 'N' })
    );
    expect(verdict.code).toBe('NOTIFICATION');
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(classifyDamage(damage()))).toBe(true);
  });
});

describe('rolling up', () => {
  const damages = [
    damage({ id: 'd1' }),
    damage({ id: 'd2', ticketNumber: null }),
    damage({ id: 'd3', marksPresent: 'N', marksAccurate: 'N' }),
    damage({ id: 'd4', method: 'hand' }),
  ];

  it('says whether the cost can be pursued', () => {
    expect(isRecoverable(damages[0])).toBe(true);
    expect(isRecoverable(damages[2])).toBe(false);
  });

  it('counts by family', () => {
    expect(causeCounts(damages)).toEqual({
      NOTIFICATION: 1,
      LOCATING: 1,
      EXCAVATION: 1,
      MISCELLANEOUS: 1,
    });
  });

  it('counts nothing without falling over', () => {
    expect(causeCounts([]).NOTIFICATION).toBe(0);
  });

  it('measures the operator share', () => {
    expect(operatorShare(damages)).toBe(0.25);
    expect(operatorShare([])).toBe(0);
  });
});
