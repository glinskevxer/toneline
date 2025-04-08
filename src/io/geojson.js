/**
 * GeoJSON out.
 *
 * The mapping team wants to see a day of tickets on top of the network, and
 * every tool they have reads GeoJSON. This writes it and nothing reads it back,
 * on purpose: the desk's own records are the source of truth and a round trip
 * through a drawing package is not somewhere to pick up a coordinate.
 */

import { toPoint } from '../geo/point.js';
import { toRing } from '../geo/polygon.js';
import { workAreaFor } from '../ticket/site.js';
import { facilityType } from '../ticket/types.js';

/** A point feature. */
export function pointFeature(value, properties = {}) {
  const point = toPoint(value);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
    properties,
  };
}

/** A line feature. */
export function lineFeature(points, properties = {}) {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: points.map(toPoint).map((point) => [point.lon, point.lat]),
    },
    properties,
  };
}

/** A polygon feature, closing the ring on the way. */
export function polygonFeature(ring, properties = {}) {
  const closed = toRing(ring);
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [closed.map((point) => [point.lon, point.lat])],
    },
    properties,
  };
}

/** Wrap features into a collection. */
export function collection(features) {
  return { type: 'FeatureCollection', features };
}

/** One facility as a line, carrying what a map needs to label it. */
export function facilityFeature(facility) {
  return lineFeature(facility.path, {
    id: facility.id,
    type: facility.type,
    label: facilityType(facility.type).label,
    colour: facilityType(facility.type).colour,
    district: facility.district,
    abandoned: facility.abandoned,
    depthFeet: facility.depthFeet,
  });
}

/** One ticket as its work area, or as a point when there is no area. */
export function ticketFeature(ticket, options = {}) {
  const area = workAreaFor(ticket, { policy: options.site });
  const properties = {
    number: ticket.number,
    ticketType: ticket.type,
    status: ticket.status,
    address: ticket.address,
    takenAt: ticket.takenAt,
    workArea: area.source,
  };
  if (area.ring !== null) return polygonFeature(area.ring, properties);
  return null;
}

/** The whole network as a collection. */
export function networkCollection(network) {
  return collection(network.all().map(facilityFeature));
}

/** A day of tickets as a collection, leaving out the ones with no geometry. */
export function ticketCollection(tickets, options = {}) {
  const features = [];
  for (const ticket of tickets) {
    const feature = ticketFeature(ticket, options);
    if (feature !== null) features.push(feature);
  }
  return collection(features);
}

/** The network and the tickets together, which is what gets looked at. */
export function deskCollection(network, tickets, options = {}) {
  return collection([
    ...network.all().map(facilityFeature),
    ...ticketCollection(tickets, options).features,
  ]);
}
