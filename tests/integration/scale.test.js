import { describe, expect, it } from 'vitest';
import { makeConfig, makeFacilities, makeTickets } from '../../src/testing/generate.js';
import { loadDesk, screeningContext } from '../../src/config/load.js';
import { buildTicket } from '../../src/ticket/record.js';
import { screenTicket } from '../../src/screening/screen.js';
import { FacilityNetwork, buildNetwork } from '../../src/network/network.js';
import { toleranceMetresOf } from '../../src/network/facility.js';
import { pointToPolyline } from '../../src/geo/segment.js';
import { workAreaFor } from '../../src/ticket/site.js';
import { ringContains } from '../../src/geo/polygon.js';

const FACILITIES = makeFacilities(400, { seed: 11 });
const TICKETS = makeTickets(80, { seed: 12, spreadMetres: 1800 }).map(buildTicket);
const desk = loadDesk(makeConfig(), { facilities: FACILITIES });

/**
 * The same question the index answers, asked of every run in turn.
 *
 * This is what the grid is meant to be a faster version of, so it is the thing
 * to compare against rather than a remembered list of ids.
 */
function scanFor(ticket) {
  const area = workAreaFor(ticket);
  if (area.ring === null) return [];
  const found = [];
  for (const facility of desk.network.all()) {
    const reach = toleranceMetresOf(facility) + 25 / 3.280839895013123;
    const inside = facility.path.some((point) => ringContains(area.ring, point));
    const near = area.ring.some((vertex) => pointToPolyline(vertex, facility.path).metres <= reach);
    if (inside || near) found.push(facility.id);
  }
  return found.sort();
}

describe('the index against a full scan', () => {
  const context = screeningContext(desk);

  it('loads the whole generated network', () => {
    expect(desk.network.size).toBe(400);
  });

  // The scan is quadratic and this suite also runs under coverage, where every
  // line costs more, so the comparison is over a slice rather than the lot. The
  // timeout is stated because a slow machine failing this test would say
  // nothing about the index.
  it(
    'finds the same plant the scan finds, ticket by ticket',
    () => {
      for (const ticket of TICKETS.slice(0, 12)) {
        const indexed = screenTicket(ticket, context)
          .hits.map((hit) => hit.facilityId)
          .sort();
        expect(indexed).toEqual(scanFor(ticket));
      }
    },
    { timeout: 30000 }
  );

  it('finds something for most tickets over a dense network', () => {
    const withHits = TICKETS.filter((ticket) => screenTicket(ticket, context).hits.length > 0);
    expect(withHits.length).toBeGreaterThan(TICKETS.length / 3);
  });

  it('looks at far fewer runs than the network holds', () => {
    const area = workAreaFor(TICKETS[0]);
    const candidates = desk.network.candidates({
      south: area.ring[0].lat - 0.001,
      west: area.ring[0].lon - 0.001,
      north: area.ring[0].lat + 0.001,
      east: area.ring[0].lon + 0.001,
    });
    expect(candidates.length).toBeLessThan(desk.network.size / 4);
  });
});

describe('a month of tickets', () => {
  const context = screeningContext(desk);

  it(
    'screens every one of them without falling over',
    () => {
      const results = TICKETS.map((ticket) => screenTicket(ticket, context));
      expect(results).toHaveLength(TICKETS.length);
      expect(results.every((result) => Array.isArray(result.hits))).toBe(true);
    },
    { timeout: 30000 }
  );

  it(
    'screens a month in a reasonable time',
    () => {
      const started = Date.now();
      for (const ticket of TICKETS) screenTicket(ticket, context);
      expect(Date.now() - started).toBeLessThan(20000);
    },
    { timeout: 30000 }
  );

  it('gives the same answer twice for the same ticket', () => {
    const first = screenTicket(TICKETS[3], context);
    const second = screenTicket(TICKETS[3], context);
    expect(second.hits.map((hit) => hit.facilityId)).toEqual(
      first.hits.map((hit) => hit.facilityId)
    );
  });

  it('keeps working when the network is emptied out', () => {
    const bare = loadDesk(makeConfig(), { facilities: [] });
    const result = screenTicket(TICKETS[0], screeningContext(bare));
    expect(result.hits).toEqual([]);
    expect(result.clearReason).toBe('no facilities');
  });

  it('keeps working when the network is one run', () => {
    const single = buildNetwork(FACILITIES.slice(0, 1));
    const result = screenTicket(TICKETS[0], { network: single, districts: desk.districts });
    expect(Array.isArray(result.hits)).toBe(true);
  });
});

describe('the answer does not depend on the cell size', () => {
  const sizes = [0.001, 0.005, 0.02];

  it('finds the same plant however the grid is cut', () => {
    const districts = desk.districts;
    for (const ticket of TICKETS.slice(0, 8)) {
      const answers = sizes.map((cellDegrees) => {
        const network = new FacilityNetwork({ cellDegrees });
        network.addAll(FACILITIES);
        return screenTicket(ticket, { network, districts })
          .hits.map((hit) => hit.facilityId)
          .sort();
      });
      expect(answers[1]).toEqual(answers[0]);
      expect(answers[2]).toEqual(answers[0]);
    }
  });

  it('cuts the grid into more cells as the size comes down', () => {
    const counts = sizes.map((cellDegrees) => {
      const network = new FacilityNetwork({ cellDegrees });
      network.addAll(FACILITIES);
      return network.stats().cells;
    });
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
  });
});
