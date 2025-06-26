/**
 * Doing something about it.
 *
 * An investigation that ends in a finding and no change is an investigation
 * that will be repeated. Prevention actions are tracked separately from the
 * investigation that raised them, because they outlive it: a retraining course
 * raised in March is still the answer to a damage in September.
 */

import { deepFreeze, normaliseCode, optionalString, requireString } from '../core/fields.js';
import { compareDates, daysBetween } from '../time/date.js';
import { dateOf } from '../time/stamp.js';
import { DamageError } from './report.js';
import { classifyDamage } from './rootCause.js';

/** The kinds of thing an operator can actually do. */
export const ACTION_KINDS = Object.freeze([
  'TRAINING',
  'PROCEDURE',
  'MAPPING',
  'EQUIPMENT',
  'EXCAVATOR',
  'ENFORCEMENT',
]);

/** Build a prevention action. */
export function buildAction(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DamageError('an action must be built from an object', { type: typeof raw });
  }
  const kind = normaliseCode(raw.kind);
  if (!ACTION_KINDS.includes(kind)) {
    throw new DamageError('that is not something we can do about a damage', {
      kind,
      known: ACTION_KINDS,
    });
  }
  const raisedOn = requireString(raw.raisedOn, 'raisedOn');
  const dueOn = requireString(raw.dueOn, 'dueOn');
  if (compareDates(dueOn, raisedOn) < 0) {
    throw new DamageError('an action cannot be due before it was raised', { raisedOn, dueOn });
  }
  const doneOn = optionalString(raw.doneOn, 'doneOn');
  if (doneOn !== null && compareDates(doneOn, raisedOn) < 0) {
    throw new DamageError('an action cannot be done before it was raised', { raisedOn, doneOn });
  }
  return deepFreeze({
    id: requireString(raw.id, 'id').toUpperCase(),
    kind,
    description: requireString(raw.description, 'description'),
    fromDamage: optionalString(raw.fromDamage, 'fromDamage'),
    owner: requireString(raw.owner, 'owner'),
    raisedOn,
    dueOn,
    doneOn,
  });
}

/** Where an action stands on a date. */
export function actionStatus(action, date) {
  if (action.doneOn !== null) {
    return compareDates(action.doneOn, action.dueOn) > 0 ? 'done late' : 'done';
  }
  return compareDates(date, action.dueOn) > 0 ? 'overdue' : 'open';
}

/** The actions still owed on a date, worst first. */
export function outstanding(actions, date) {
  return actions
    .filter((action) => action.doneOn === null)
    .map((action) => ({
      ...action,
      status: actionStatus(action, date),
      daysLeft: daysBetween(date, action.dueOn),
    }))
    .sort((left, right) => left.daysLeft - right.daysLeft || left.id.localeCompare(right.id));
}

/**
 * The kinds of action the root causes seen would suggest.
 *
 * This does not decide anything, it points: a run of locating failures is a
 * mapping and training question, a run of excavation failures is a question for
 * the excavator and, past a point, for the regulator.
 */
export function suggestedKinds(damages) {
  const causes = new Set(damages.map((damage) => classifyDamage(damage).code));
  const kinds = new Set();
  if (causes.has('LOCATING')) {
    kinds.add('MAPPING');
    kinds.add('TRAINING');
  }
  if (causes.has('EXCAVATION')) {
    kinds.add('EXCAVATOR');
  }
  if (causes.has('NOTIFICATION')) {
    kinds.add('EXCAVATOR');
    kinds.add('ENFORCEMENT');
  }
  if (causes.has('MISCELLANEOUS')) {
    kinds.add('PROCEDURE');
  }
  return [...kinds].sort();
}

/**
 * How a set of actions is going.
 *
 * @param {object[]} actions
 * @param {string} date
 */
export function actionSummary(actions, date) {
  const counts = { open: 0, overdue: 0, done: 0, 'done late': 0 };
  for (const action of actions) counts[actionStatus(action, date)] += 1;
  const closed = counts.done + counts['done late'];
  return deepFreeze({
    actions: actions.length,
    ...counts,
    closedShare: actions.length === 0 ? 0 : closed / actions.length,
    onTimeShare: closed === 0 ? 0 : counts.done / closed,
  });
}

/** Actions raised by one damage. */
export function actionsFor(actions, damageId) {
  const wanted = normaliseCode(damageId);
  return actions
    .filter((action) => (action.fromDamage ?? '').toUpperCase() === wanted)
    .sort((left, right) => left.raisedOn.localeCompare(right.raisedOn));
}

/** The date an action was raised, read from a damage. */
export function raisedFrom(damage) {
  return dateOf(damage.at);
}
