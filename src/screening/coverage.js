/**
 * Coverage.
 *
 * Two questions a locate manager asks once a quarter and cannot answer from the
 * daily numbers. Which parts of the network never come up, because plant that
 * is never located is either in a quiet street or is not really there. And
 * which tickets fell outside every district, because a run of those in one town
 * means the member codes are wrong at the centre.
 */

import { deepFreeze } from '../core/fields.js';
import { normaliseStreet } from '../text/address.js';

/** Facility ids that appeared in at least one screening. */
export function touchedFacilities(screenings) {
  const seen = new Set();
  for (const screening of screenings) {
    for (const hit of screening.hits) seen.add(hit.facilityId);
  }
  return [...seen].sort();
}

/** Facility ids the network holds that no screening ever found. */
export function untouchedFacilities(network, screenings) {
  const touched = new Set(touchedFacilities(screenings));
  return network
    .all()
    .filter((facility) => !touched.has(facility.id))
    .map((facility) => facility.id)
    .sort();
}

/** How often each district came up. */
export function districtCounts(screenings) {
  const counts = {};
  for (const screening of screenings) {
    for (const code of screening.districts) counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

/**
 * Tickets that landed outside every district, grouped by the place they name.
 *
 * A handful anywhere is normal. A pile in one place means the centre is sending
 * work the desk has not told it about, or has stopped sending work it should.
 */
export function outsideByPlace(entries) {
  const places = new Map();
  for (const { ticket, screening } of entries) {
    if (screening.ours) continue;
    const key = ticket.place === null ? 'unknown' : normaliseStreet(ticket.place);
    const bucket = places.get(key) ?? [];
    bucket.push(ticket.number);
    places.set(key, bucket);
  }
  return [...places.keys()]
    .sort()
    .map((place) => ({ place, tickets: places.get(place) }))
    .sort(
      (left, right) =>
        right.tickets.length - left.tickets.length || left.place.localeCompare(right.place)
    );
}

/**
 * The whole coverage picture.
 *
 * @param {object} network the facility network
 * @param {Array<{ticket: object, screening: object}>} entries what was screened
 */
export function coverageReport(network, entries) {
  const screenings = entries.map((entry) => entry.screening);
  const untouched = untouchedFacilities(network, screenings);
  const outside = outsideByPlace(entries);
  const outsideCount = outside.reduce((sum, place) => sum + place.tickets.length, 0);
  return deepFreeze({
    tickets: entries.length,
    ours: entries.length - outsideCount,
    outside: outsideCount,
    outsideByPlace: outside,
    facilities: network.size,
    touched: touchedFacilities(screenings).length,
    untouched,
    touchedShare: network.size === 0 ? 0 : (network.size - untouched.length) / network.size,
    districts: districtCounts(screenings),
  });
}

/** The places worth chasing the centre about. */
export function suspectPlaces(report, threshold = 3) {
  return report.outsideByPlace.filter((place) => place.tickets.length >= threshold);
}
