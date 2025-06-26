import { describe, expect, it } from 'vitest';
import {
  ACTION_KINDS,
  buildAction,
  actionStatus,
  outstanding,
  suggestedKinds,
  actionSummary,
  actionsFor,
  raisedFrom,
} from '../../src/damage/prevention.js';
import { DamageError, buildDamage } from '../../src/damage/report.js';

function action(overrides = {}) {
  return buildAction({
    id: 'act-1',
    kind: 'training',
    description: 'retrain the crew on tolerance zones',
    fromDamage: 'DMG-1',
    owner: 'kmartel',
    raisedOn: '2024-03-20',
    dueOn: '2024-04-20',
    ...overrides,
  });
}

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

describe('buildAction', () => {
  it('builds a frozen record', () => {
    const built = action();
    expect(built.id).toBe('ACT-1');
    expect(built.kind).toBe('TRAINING');
    expect(built.doneOn).toBeNull();
    expect(Object.isFrozen(built)).toBe(true);
  });

  it('lists the kinds it accepts', () => {
    expect(ACTION_KINDS).toContain('MAPPING');
    expect(ACTION_KINDS).toHaveLength(6);
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildAction(null)).toThrow(DamageError);
  });

  it('rejects a kind that is not something we can do', () => {
    try {
      action({ kind: 'hoping' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.known).toEqual(ACTION_KINDS);
    }
  });

  it('rejects dates that run backwards', () => {
    expect(() => action({ dueOn: '2024-03-01' })).toThrow(/due before it was raised/);
    expect(() => action({ doneOn: '2024-03-01' })).toThrow(/done before it was raised/);
  });

  it('demands an owner and a description', () => {
    expect(() => action({ owner: '' })).toThrow(/owner is required/);
    expect(() => action({ description: '' })).toThrow(/description is required/);
  });
});

describe('actionStatus', () => {
  it('is open while there is time', () => {
    expect(actionStatus(action(), '2024-04-01')).toBe('open');
  });

  it('is overdue once the date has passed', () => {
    expect(actionStatus(action(), '2024-04-21')).toBe('overdue');
  });

  it('is done or done late once it has been done', () => {
    expect(actionStatus(action({ doneOn: '2024-04-10' }), '2024-05-01')).toBe('done');
    expect(actionStatus(action({ doneOn: '2024-04-25' }), '2024-05-01')).toBe('done late');
  });
});

describe('outstanding', () => {
  const actions = [
    action(),
    action({ id: 'act-2', dueOn: '2024-03-25' }),
    action({ id: 'act-3', doneOn: '2024-03-22' }),
  ];

  it('keeps only what is still owed, soonest due first', () => {
    const owed = outstanding(actions, '2024-03-24');
    expect(owed.map((entry) => entry.id)).toEqual(['ACT-2', 'ACT-1']);
    expect(owed[0].daysLeft).toBe(1);
  });

  it('marks the overdue ones', () => {
    expect(outstanding(actions, '2024-04-30')[0].status).toBe('overdue');
  });

  it('finds nothing owed when everything is done', () => {
    expect(outstanding([actions[2]], '2024-04-30')).toEqual([]);
  });
});

describe('suggestedKinds', () => {
  it('points at mapping and training for a locating failure', () => {
    const ours = damage({ marksPresent: 'N', marksAccurate: 'N' });
    expect(suggestedKinds([ours])).toEqual(['MAPPING', 'TRAINING']);
  });

  it('points at the excavator for an excavation failure', () => {
    expect(suggestedKinds([damage()])).toEqual(['EXCAVATOR']);
  });

  it('adds enforcement when nobody called at all', () => {
    expect(suggestedKinds([damage({ ticketNumber: null })])).toEqual(['ENFORCEMENT', 'EXCAVATOR']);
  });

  it('points at procedure for the ones nobody can explain', () => {
    expect(suggestedKinds([damage({ method: 'hand' })])).toEqual(['PROCEDURE']);
  });

  it('points at nothing when there were no damages', () => {
    expect(suggestedKinds([])).toEqual([]);
  });
});

describe('actionSummary and actionsFor', () => {
  const actions = [
    action(),
    action({ id: 'act-2', dueOn: '2024-03-25' }),
    action({ id: 'act-3', doneOn: '2024-04-10' }),
    action({ id: 'act-4', doneOn: '2024-04-25' }),
  ];

  it('counts where everything stands', () => {
    const summary = actionSummary(actions, '2024-04-01');
    expect(summary.actions).toBe(4);
    expect(summary.open).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.done).toBe(1);
    expect(summary['done late']).toBe(1);
  });

  it('measures the shares', () => {
    const summary = actionSummary(actions, '2024-04-01');
    expect(summary.closedShare).toBe(0.5);
    expect(summary.onTimeShare).toBe(0.5);
  });

  it('summarises nothing without dividing by zero', () => {
    expect(actionSummary([], '2024-04-01').closedShare).toBe(0);
    expect(actionSummary([action()], '2024-04-01').onTimeShare).toBe(0);
  });

  it('gathers the actions one damage raised', () => {
    const other = action({ id: 'act-9', fromDamage: 'DMG-2' });
    expect(actionsFor([...actions, other], 'dmg-1')).toHaveLength(4);
    expect(actionsFor([...actions, other], 'DMG-2')).toHaveLength(1);
  });

  it('reads the date a damage was raised on', () => {
    expect(raisedFrom(damage())).toBe('2024-03-19');
  });
});
