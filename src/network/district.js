/**
 * Service districts.
 *
 * The operator splits its territory into districts, each with its own crew and
 * its own member code at the centre. A ticket that lands outside every district
 * is not ours to answer, and one that straddles two has to go to both.
 */

import { TonelineError } from '../core/errors.js';
import { deepFreeze, optionalList, optionalString, requireString } from '../core/fields.js';
import { ringBounds, ringContains, ringIntersectsPolyline, toRing } from '../geo/polygon.js';
import { boundsOverlap } from '../geo/bbox.js';

/** Raised when a district record cannot be used. */
export class DistrictError extends TonelineError {
  constructor(message, details = {}) {
    super('DISTRICT_INVALID', message, details);
  }
}

/** Build a district from a loose record. */
export function buildDistrict(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new DistrictError('a district must be built from an object', { type: typeof raw });
  }
  const code = requireString(raw.code, 'code').toUpperCase();
  let boundary;
  try {
    boundary = toRing(raw.boundary ?? raw.ring);
  } catch (err) {
    throw new DistrictError('a district needs a boundary ring', { code, reason: err.message });
  }
  return deepFreeze({
    code,
    name: optionalString(raw.name, 'name', code),
    boundary,
    members: optionalList(raw.members, 'members').map((entry) => entry.toUpperCase()),
    crew: optionalString(raw.crew, 'crew'),
    contact: optionalString(raw.contact, 'contact'),
    afterHoursPhone: optionalString(raw.afterHoursPhone, 'afterHoursPhone'),
  });
}

/** True when the point falls inside the district. */
export function districtContains(district, value) {
  return ringContains(district.boundary, value);
}

/** Every district a point falls in, in the order they were given. */
export function districtsAt(districts, value) {
  return districts.filter((district) => districtContains(district, value));
}

/** Every district a dig site ring touches at all. */
export function districtsForRing(districts, ring) {
  const site = toRing(ring);
  const siteBox = ringBounds(site);
  return districts.filter((district) => {
    if (!boundsOverlap(siteBox, ringBounds(district.boundary))) return false;
    if (site.some((point) => districtContains(district, point))) return true;
    if (district.boundary.some((point) => ringContains(site, point))) return true;
    return ringIntersectsPolyline(district.boundary, site);
  });
}

/** True when the member code belongs to one of the districts. */
export function isOurMember(districts, code) {
  const wanted = String(code ?? '').toUpperCase();
  return districts.some((district) => district.members.includes(wanted));
}

/** Every member code the operator answers to, with no repeats. */
export function memberCodes(districts) {
  const codes = new Set();
  for (const district of districts) {
    for (const member of district.members) codes.add(member);
  }
  return [...codes].sort();
}

/** Look a district up by code. */
export function districtByCode(districts, code) {
  const wanted = String(code ?? '').toUpperCase();
  return districts.find((district) => district.code === wanted) ?? null;
}

/** Build a list of districts, refusing a repeated code. */
export function buildDistricts(records) {
  const built = [];
  const seen = new Set();
  for (const record of records ?? []) {
    const district = buildDistrict(record);
    if (seen.has(district.code)) {
      throw new DistrictError('two districts share a code', { code: district.code });
    }
    seen.add(district.code);
    built.push(district);
  }
  return built;
}
