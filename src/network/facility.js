/**
 * Buried facilities.
 *
 * One record per run of pipe, cable or conduit the operator owns. The path is a
 * polyline in the order it was surveyed, and the tolerance zone comes from the
 * facility type unless the record overrides it, which happens on transmission
 * mains and anything the regulator treats as high consequence.
 */

import { TonelineError } from '../core/errors.js';
import {
  deepFreeze,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireArray,
  requireString,
} from '../core/fields.js';
import { boundsOf, expandBounds } from '../geo/bbox.js';
import { feetToMetres, toPoint } from '../geo/point.js';
import { polylineLengthMetres, pointToPolyline } from '../geo/segment.js';
import { facilityType } from '../ticket/types.js';
import { isDate } from '../time/date.js';

/** Raised when a facility record cannot be used. */
export class FacilityError extends TonelineError {
  constructor(message, details = {}) {
    super('FACILITY_INVALID', message, details);
  }
}

/** Build a facility from a loose record. */
export function buildFacility(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new FacilityError('a facility must be built from an object', { type: typeof raw });
  }
  const id = requireString(raw.id, 'id').toUpperCase();
  const type = facilityType(requireString(raw.type, 'type')).code;
  const path = requireArray(raw.path, 'path', { allowEmpty: false }).map(toPoint);
  if (path.length < 2) {
    throw new FacilityError('a facility path needs at least two points', {
      id,
      points: path.length,
    });
  }
  const installedOn = optionalString(raw.installedOn, 'installedOn');
  if (installedOn !== null && !isDate(installedOn)) {
    throw new FacilityError('installedOn must be a calendar date', { id, installedOn });
  }
  const toleranceFeet = optionalNumber(raw.toleranceFeet, 'toleranceFeet');
  if (toleranceFeet !== null && toleranceFeet < 0) {
    throw new FacilityError('a tolerance zone cannot be negative', { id, toleranceFeet });
  }
  return deepFreeze({
    id,
    type,
    member: optionalString(raw.member, 'member', null),
    district: optionalString(raw.district, 'district', null),
    path,
    depthFeet: optionalNumber(raw.depthFeet, 'depthFeet'),
    diameterInches: optionalNumber(raw.diameterInches, 'diameterInches'),
    material: optionalString(raw.material, 'material'),
    abandoned: optionalBoolean(raw.abandoned, 'abandoned'),
    highConsequence: optionalBoolean(raw.highConsequence, 'highConsequence'),
    installedOn,
    toleranceFeet,
    note: optionalString(raw.note, 'note'),
  });
}

/** The tolerance zone the facility is marked to, in feet. */
export function toleranceFeetOf(facility) {
  if (facility.toleranceFeet !== null) return facility.toleranceFeet;
  return facilityType(facility.type).toleranceFeet;
}

/** The tolerance zone in metres, which is what the geometry works in. */
export function toleranceMetresOf(facility) {
  return feetToMetres(toleranceFeetOf(facility));
}

/** Bounds of the facility path, grown by its own tolerance zone. */
export function facilityBounds(facility, extraMetres = 0) {
  return expandBounds(boundsOf(facility.path), toleranceMetresOf(facility) + extraMetres);
}

/** Length of the run in metres. */
export function facilityLengthMetres(facility) {
  return polylineLengthMetres(facility.path);
}

/** Closest approach from a point to the facility, in metres. */
export function distanceToFacility(facility, value) {
  return pointToPolyline(value, facility.path).metres;
}

/** True when the point falls inside the facility's tolerance zone. */
export function insideToleranceZone(facility, value) {
  return distanceToFacility(facility, value) <= toleranceMetresOf(facility);
}

/** True when the facility has to be marked at all. */
export function isMarkable(facility) {
  return !facility.abandoned;
}

/** A short description for reports and response text. */
export function describeFacility(facility) {
  const size = facility.diameterInches === null ? '' : `${facility.diameterInches} inch `;
  const material = facility.material === null ? '' : `${facility.material} `;
  return `${facility.id} ${size}${material}${facilityType(facility.type).label}`.replace(
    /\s+/g,
    ' '
  );
}
