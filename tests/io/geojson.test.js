import { describe, expect, it } from 'vitest';
import {
  pointFeature,
  lineFeature,
  polygonFeature,
  collection,
  facilityFeature,
  ticketFeature,
  networkCollection,
  ticketCollection,
  deskCollection,
} from '../../src/io/geojson.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildFacility } from '../../src/network/facility.js';
import { buildTicket } from '../../src/ticket/record.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 200, 90);

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
    extent: '50 feet',
    site: { points: [A] },
    ...overrides,
  });
}

describe('the plain features', () => {
  it('writes a point longitude first', () => {
    const feature = pointFeature(A, { id: 'x' });
    expect(feature.geometry).toEqual({ type: 'Point', coordinates: [-97.5164, 35.4676] });
    expect(feature.properties).toEqual({ id: 'x' });
  });

  it('writes a line', () => {
    const feature = lineFeature([A, B]);
    expect(feature.geometry.type).toBe('LineString');
    expect(feature.geometry.coordinates).toHaveLength(2);
  });

  it('writes a polygon and closes the ring', () => {
    const feature = polygonFeature([A, B, destination(B, 200, 0)]);
    const ring = feature.geometry.coordinates[0];
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[3]);
  });

  it('wraps features into a collection', () => {
    expect(collection([pointFeature(A)])).toEqual({
      type: 'FeatureCollection',
      features: [pointFeature(A)],
    });
  });
});

describe('facilityFeature', () => {
  it('carries what a map needs to label it', () => {
    const feature = facilityFeature(
      buildFacility({ id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, B], depthFeet: 3 })
    );
    expect(feature.properties).toEqual({
      id: 'GM-1',
      type: 'GAS',
      label: 'natural gas',
      colour: 'yellow',
      district: 'CENTRAL',
      abandoned: false,
      depthFeet: 3,
    });
  });
});

describe('ticketFeature', () => {
  it('writes the work area as a polygon', () => {
    const feature = ticketFeature(ticket());
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.properties.number).toBe('B240315000420');
    expect(feature.properties.workArea).toBe('extent');
  });

  it('writes nothing for a ticket with no geometry', () => {
    expect(ticketFeature(ticket({ site: null }))).toBeNull();
  });

  it('honours a site policy', () => {
    const tight = ticketFeature(ticket({ extent: null }), {
      site: { pointRadiusFeet: 10, corridorHalfWidthFeet: 10, maxRadiusFeet: 100 },
    });
    const loose = ticketFeature(ticket({ extent: null }));
    const tightReach = Math.abs(tight.geometry.coordinates[0][0][1] - A.lat);
    const looseReach = Math.abs(loose.geometry.coordinates[0][0][1] - A.lat);
    expect(tightReach).toBeGreaterThan(0);
    expect(tightReach).toBeLessThan(looseReach);
  });
});

describe('the collections', () => {
  const network = buildNetwork([
    { id: 'GM-1', type: 'gas', path: [A, B] },
    { id: 'WT-1', type: 'water', path: [A, B] },
  ]);

  it('writes the whole network', () => {
    const geo = networkCollection(network);
    expect(geo.features).toHaveLength(2);
    expect(geo.features.every((feature) => feature.geometry.type === 'LineString')).toBe(true);
  });

  it('writes a day of tickets and leaves out the ones with nowhere to draw', () => {
    const geo = ticketCollection([ticket(), ticket({ number: 'B240315000421', site: null })]);
    expect(geo.features).toHaveLength(1);
  });

  it('writes the network and the tickets together', () => {
    const geo = deskCollection(network, [ticket()]);
    expect(geo.features).toHaveLength(3);
    expect(geo.type).toBe('FeatureCollection');
  });

  it('writes an empty collection from an empty desk', () => {
    expect(deskCollection(buildNetwork([]), []).features).toEqual([]);
  });

  it('survives a round trip through json', () => {
    const geo = deskCollection(network, [ticket()]);
    expect(JSON.parse(JSON.stringify(geo))).toEqual(geo);
  });
});
