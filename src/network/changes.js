/**
 * Plant changes.
 *
 * The mapping system changes under the desk: a service goes in, a main is
 * rerouted, an old line is abandoned. A ticket already screened against the old
 * picture may now be wrong, so every change is recorded and the tickets it
 * could touch are named rather than everyone re-screening the whole day.
 */

import { deepFreeze, normaliseCode, optionalString, requireString } from '../core/fields.js';
import { boundsOf, boundsOverlap, expandBounds } from '../geo/bbox.js';
import { ringBounds } from '../geo/polygon.js';
import { isStamp } from '../time/stamp.js';
import { workAreaFor } from '../ticket/site.js';
import { FacilityError, buildFacility, toleranceMetresOf } from './facility.js';

/** The kinds of change the mapping system sends. */
export const CHANGE_KINDS = Object.freeze(['ADDED', 'MOVED', 'ABANDONED', 'REMOVED']);

/** Build one change record. */
export function buildChange(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new FacilityError('a change must be built from an object', { type: typeof raw });
  }
  const kind = normaliseCode(raw.kind);
  if (!CHANGE_KINDS.includes(kind)) {
    throw new FacilityError('that is not a change the mapping system sends', {
      kind,
      known: CHANGE_KINDS,
    });
  }
  const at = requireString(raw.at, 'at');
  if (!isStamp(at)) {
    throw new FacilityError('a change needs a timestamp', { at });
  }
  const facilityId = requireString(raw.facilityId, 'facilityId').toUpperCase();
  const facility =
    raw.facility === undefined || raw.facility === null ? null : buildFacility(raw.facility);
  if (['ADDED', 'MOVED'].includes(kind) && facility === null) {
    throw new FacilityError('this change has to carry the facility as it now stands', {
      kind,
      facilityId,
    });
  }
  if (facility !== null && facility.id !== facilityId) {
    throw new FacilityError('the change and the facility name different runs', {
      facilityId,
      carried: facility.id,
    });
  }
  return deepFreeze({
    kind,
    facilityId,
    facility,
    at,
    by: requireString(raw.by, 'by'),
    note: optionalString(raw.note, 'note'),
  });
}

/**
 * Apply a change to a network.
 *
 * The network is edited in place because it is the desk's one copy of the
 * world, and the facility as it now stands is handed back so a caller can log
 * what it did.
 */
export function applyChange(network, change) {
  const held = network.get(change.facilityId);
  switch (change.kind) {
    case 'ADDED':
      if (held !== null) {
        throw new FacilityError('the network already carries that facility id', {
          id: change.facilityId,
        });
      }
      return network.add(change.facility);
    case 'MOVED':
      requireHeld(held, change);
      removeFacility(network, change.facilityId);
      return network.add(change.facility);
    case 'ABANDONED': {
      requireHeld(held, change);
      removeFacility(network, change.facilityId);
      return network.add(buildFacility({ ...held, abandoned: true }));
    }
    case 'REMOVED':
      requireHeld(held, change);
      removeFacility(network, change.facilityId);
      return null;
    default:
      throw new FacilityError('that is not a change the mapping system sends', {
        kind: change.kind,
      });
  }
}

function requireHeld(held, change) {
  if (held === null) {
    throw new FacilityError('the network does not carry that facility', {
      id: change.facilityId,
      kind: change.kind,
    });
  }
}

function removeFacility(network, id) {
  network.facilities.delete(id);
  for (const [key, bucket] of network.cells) {
    const kept = bucket.filter((entry) => entry !== id);
    if (kept.length === 0) network.cells.delete(key);
    else network.cells.set(key, kept);
  }
}

/**
 * The tickets a change could touch.
 *
 * A change is compared against each ticket's work area grown by the facility's
 * own tolerance zone, so a service moved two feet does not drag in the whole
 * street.
 */
export function ticketsAffected(change, tickets, options = {}) {
  const facility = change.facility ?? options.previous ?? null;
  if (facility === null) return [];
  const reach = toleranceMetresOf(facility) + (options.marginMetres ?? 8);
  const box = expandBounds(boundsOf(facility.path), reach);
  const affected = [];
  for (const ticket of tickets) {
    const area = workAreaFor(ticket, { policy: options.site });
    if (area.ring === null) continue;
    if (boundsOverlap(box, ringBounds(area.ring))) affected.push(ticket.number);
  }
  return affected;
}

/** Changes sorted oldest first, with a stable order inside a minute. */
export function sortChanges(changes) {
  return [...changes].sort(
    (left, right) =>
      left.at.localeCompare(right.at) || left.facilityId.localeCompare(right.facilityId)
  );
}

/** A one line description for the change log. */
export function describeChange(change) {
  return `${change.at} ${change.facilityId} ${change.kind.toLowerCase()} by ${change.by}`;
}
