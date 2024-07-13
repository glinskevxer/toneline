/**
 * Damage reports.
 *
 * When plant is hit, the operator writes up what happened while the crew is
 * still on site. The report is what the root cause coding and the cost recovery
 * both read, so it records the facts and passes no judgement: whether marks
 * were there, whether they were right, and what the excavator was doing.
 */

import { TonelineError } from '../core/errors.js';
import {
  deepFreeze,
  normaliseCode,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireString,
} from '../core/fields.js';
import { toPoint } from '../geo/point.js';
import { isStamp } from '../time/stamp.js';
import { facilityType } from '../ticket/types.js';

/** Raised when a damage report cannot be used. */
export class DamageError extends TonelineError {
  constructor(message, details = {}) {
    super('DAMAGE_INVALID', message, details);
  }
}

/** How the excavator was working when the plant was hit. */
export const EXCAVATION_METHODS = Object.freeze([
  'BACKHOE',
  'TRENCHER',
  'BORING',
  'HAND',
  'AUGER',
  'GRADER',
  'VACUUM',
  'OTHER',
]);

/** Build a damage report from a loose record. */
export function buildDamage(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DamageError('a damage report must be built from an object', { type: typeof raw });
  }
  const id = requireString(raw.id, 'id').toUpperCase();
  const at = requireString(raw.at, 'at');
  if (!isStamp(at)) {
    throw new DamageError('a damage report needs a timestamp', { id, at });
  }
  const method = normaliseCode(raw.method ?? 'OTHER');
  if (!EXCAVATION_METHODS.includes(method)) {
    throw new DamageError('the excavation method is not one we record', {
      id,
      method,
      known: EXCAVATION_METHODS,
    });
  }
  const type = facilityType(requireString(raw.facilityType ?? raw.type, 'facilityType')).code;
  const point = raw.point === undefined || raw.point === null ? null : toPoint(raw.point);
  const marksPresent = optionalBoolean(raw.marksPresent, 'marksPresent');
  const marksAccurate =
    raw.marksAccurate === undefined || raw.marksAccurate === null
      ? null
      : optionalBoolean(raw.marksAccurate, 'marksAccurate');
  if (!marksPresent && marksAccurate === true) {
    throw new DamageError('marks cannot be accurate when there were none', { id });
  }
  return deepFreeze({
    id,
    at,
    ticketNumber: optionalString(raw.ticketNumber, 'ticketNumber', null),
    facilityId: optionalString(raw.facilityId, 'facilityId', null),
    facilityType: type,
    point,
    excavator: optionalString(raw.excavator, 'excavator', null),
    method,
    depthFeet: optionalNumber(raw.depthFeet, 'depthFeet'),
    marksPresent,
    marksAccurate,
    ticketValid: optionalBoolean(raw.ticketValid, 'ticketValid'),
    serviceInterrupted: optionalBoolean(raw.serviceInterrupted, 'serviceInterrupted'),
    customersOut: optionalNumber(raw.customersOut, 'customersOut', 0),
    injury: optionalBoolean(raw.injury, 'injury'),
    ignition: optionalBoolean(raw.ignition, 'ignition'),
    reportedBy: requireString(raw.reportedBy, 'reportedBy'),
    narrative: optionalString(raw.narrative, 'narrative'),
  });
}

/** True when the damage has to go to the regulator. */
export function isReportable(damage) {
  if (damage.injury || damage.ignition) return true;
  if (facilityType(damage.facilityType).critical) return true;
  return damage.serviceInterrupted && damage.customersOut > 0;
}

/** True when the hit happened without a valid ticket at all. */
export function wasUnticketed(damage) {
  return damage.ticketNumber === null || !damage.ticketValid;
}

/** A short line for the register. */
export function describeDamage(damage) {
  const where = damage.facilityId === null ? damage.facilityType : damage.facilityId;
  return `${damage.id} ${damage.at} ${where} struck by ${damage.method.toLowerCase()}`;
}

/** Sort damage reports oldest first. */
export function sortDamages(damages) {
  return [...damages].sort(
    (left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id)
  );
}
