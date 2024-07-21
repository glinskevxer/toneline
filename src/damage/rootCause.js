/**
 * Root cause coding.
 *
 * Damage reporting collapses into three families: nobody called, the marks were
 * wrong, or the digging was careless. The coding below follows that split and
 * the order matters, because a hit with no ticket is a notification failure
 * whatever else was true of the excavation.
 */

import { deepFreeze } from '../core/fields.js';
import { DamageError, wasUnticketed } from './report.js';

const CAUSE_LIST = [
  {
    code: 'NOTIFICATION',
    label: 'no valid notification was given',
    responsible: 'excavator',
    recoverable: true,
  },
  {
    code: 'LOCATING',
    label: 'the facility was not marked or was marked wrong',
    responsible: 'operator',
    recoverable: false,
  },
  {
    code: 'EXCAVATION',
    label: 'the excavation did not respect the marks',
    responsible: 'excavator',
    recoverable: true,
  },
  {
    code: 'MISCELLANEOUS',
    label: 'none of the three families fits',
    responsible: 'unassigned',
    recoverable: false,
  },
];

const CAUSES = new Map(CAUSE_LIST.map((entry) => [entry.code, Object.freeze(entry)]));

/** Every root cause family. */
export const ROOT_CAUSES = Object.freeze(CAUSE_LIST.map((entry) => entry.code));

/** Look a root cause up. */
export function rootCause(code) {
  const found = CAUSES.get(String(code ?? '').toUpperCase());
  if (!found) {
    throw new DamageError('root cause is not one of the families', { code, known: ROOT_CAUSES });
  }
  return found;
}

/**
 * Work out the root cause of a damage.
 *
 * @param {object} damage
 * @returns {{code: string, reason: string, responsible: string, recoverable: boolean}}
 */
export function classifyDamage(damage) {
  if (wasUnticketed(damage)) {
    return verdict('NOTIFICATION', 'the excavator worked without a valid ticket');
  }
  if (!damage.marksPresent) {
    return verdict('LOCATING', 'the ticket was valid and the site was not marked');
  }
  if (damage.marksAccurate === false) {
    return verdict('LOCATING', 'the marks were on the ground but in the wrong place');
  }
  if (damage.method === 'HAND' || damage.method === 'VACUUM') {
    return verdict('MISCELLANEOUS', 'the plant was hit despite correct marks and careful digging');
  }
  return verdict('EXCAVATION', 'the marks were right and the excavation went through them');
}

function verdict(code, reason) {
  const family = rootCause(code);
  return deepFreeze({
    code: family.code,
    reason,
    responsible: family.responsible,
    recoverable: family.recoverable,
  });
}

/** True when the operator can pursue the excavator for the cost. */
export function isRecoverable(damage) {
  return classifyDamage(damage).recoverable;
}

/** Count a run of damages by root cause family. */
export function causeCounts(damages) {
  const counts = Object.fromEntries(ROOT_CAUSES.map((code) => [code, 0]));
  for (const damage of damages) {
    counts[classifyDamage(damage).code] += 1;
  }
  return counts;
}

/** The share of damages the operator was responsible for. */
export function operatorShare(damages) {
  if (damages.length === 0) return 0;
  const ours = damages.filter((damage) => classifyDamage(damage).responsible === 'operator').length;
  return ours / damages.length;
}
