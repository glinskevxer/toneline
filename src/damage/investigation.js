/**
 * Damage investigations.
 *
 * A reportable damage opens an investigation with a clock on it. The record
 * here is the working file: what has been gathered, what was concluded and what
 * is being done about it. An investigation cannot be closed with a finding and
 * no action, because that is how the same hole gets dug twice.
 */

import { deepFreeze, optionalString, requireString } from '../core/fields.js';
import { addDays, compareDates, daysBetween } from '../time/date.js';
import { dateOf, isStamp } from '../time/stamp.js';
import { DamageError, isReportable } from './report.js';
import { classifyDamage } from './rootCause.js';

/** How long an investigation gets before it is late. */
export const DEFAULT_INVESTIGATION_POLICY = Object.freeze({
  reportableDays: 30,
  ordinaryDays: 60,
});

/** Merge a partial investigation policy over the defaults. */
export function investigationPolicy(overrides = {}) {
  return Object.freeze({ ...DEFAULT_INVESTIGATION_POLICY, ...overrides });
}

/** The steps an investigation walks, in order. */
export const INVESTIGATION_STEPS = Object.freeze([
  'site evidence gathered',
  'ticket history pulled',
  'locator interviewed',
  'excavator interviewed',
  'records checked',
]);

/** Build an investigation record. */
export function buildInvestigation(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DamageError('an investigation must be built from an object', { type: typeof raw });
  }
  const openedAt = requireString(raw.openedAt, 'openedAt');
  if (!isStamp(openedAt)) {
    throw new DamageError('an investigation needs a timestamp to open', { openedAt });
  }
  const steps = (raw.steps ?? []).map((step) => String(step).toLowerCase());
  for (const step of steps) {
    if (!INVESTIGATION_STEPS.includes(step)) {
      throw new DamageError('that is not a step in the investigation', {
        step,
        known: INVESTIGATION_STEPS,
      });
    }
  }
  const finding = optionalString(raw.finding, 'finding');
  const actions = (raw.actions ?? []).map((action) => requireString(action, 'action'));
  const closedOn = optionalString(raw.closedOn, 'closedOn');
  if (closedOn !== null) {
    if (finding === null) {
      throw new DamageError('an investigation cannot close without a finding', { closedOn });
    }
    if (actions.length === 0) {
      throw new DamageError('an investigation cannot close without an action', { closedOn });
    }
  }
  return deepFreeze({
    damageId: requireString(raw.damageId, 'damageId').toUpperCase(),
    openedAt,
    openedBy: requireString(raw.openedBy, 'openedBy'),
    steps: [...new Set(steps)],
    finding,
    actions,
    closedOn,
  });
}

/** The date an investigation is due to be closed by. */
export function investigationDueOn(damage, investigation, policy = DEFAULT_INVESTIGATION_POLICY) {
  const days = isReportable(damage) ? policy.reportableDays : policy.ordinaryDays;
  return addDays(dateOf(investigation.openedAt), days - 1);
}

/** The steps still to do. */
export function outstandingSteps(investigation) {
  return INVESTIGATION_STEPS.filter((step) => !investigation.steps.includes(step));
}

/**
 * Where an investigation stands on a given date.
 *
 * @returns {{state: string, dueOn: string, daysLeft: number, outstanding: string[]}}
 */
export function investigationStatus(
  damage,
  investigation,
  date,
  policy = DEFAULT_INVESTIGATION_POLICY
) {
  const dueOn = investigationDueOn(damage, investigation, policy);
  const outstanding = outstandingSteps(investigation);
  if (investigation.closedOn !== null) {
    const late = compareDates(investigation.closedOn, dueOn) > 0;
    return deepFreeze({
      state: late ? 'closed late' : 'closed',
      dueOn,
      daysLeft: daysBetween(investigation.closedOn, dueOn),
      outstanding,
    });
  }
  const daysLeft = daysBetween(date, dueOn);
  return deepFreeze({
    state: daysLeft < 0 ? 'overdue' : 'open',
    dueOn,
    daysLeft,
    outstanding,
  });
}

/** The investigations a supervisor has to chase, worst first. */
export function chaseList(entries, date, policy = DEFAULT_INVESTIGATION_POLICY) {
  return entries
    .map(({ damage, investigation }) => ({
      damageId: investigation.damageId,
      ...investigationStatus(damage, investigation, date, policy),
    }))
    .filter((entry) => entry.state === 'overdue' || (entry.state === 'open' && entry.daysLeft <= 7))
    .sort(
      (left, right) => left.daysLeft - right.daysLeft || left.damageId.localeCompare(right.damageId)
    );
}

/** A one line summary of the finding for the damage register. */
export function findingLine(damage, investigation) {
  const cause = classifyDamage(damage);
  const finding = investigation.finding ?? 'no finding yet';
  return `${investigation.damageId} ${cause.code}: ${finding}`;
}
