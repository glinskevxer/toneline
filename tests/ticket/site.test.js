import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_POLICY,
  sitePolicy,
  extentFootage,
  sitePoints,
  workAreaFor,
  hasWorkArea,
  requireWorkArea,
  workAreaSquareFeet,
  workAreaCentre,
} from '../../src/ticket/site.js';
import { buildTicket } from '../../src/ticket/record.js';
import { TicketError } from '../../src/core/errors.js';
import { destination, distanceFeet } from '../../src/geo/point.js';
import { ringContains } from '../../src/geo/polygon.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = destination(A, 120, 90);
const C = destination(B, 40, 0);

function ticket(site, overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
    site,
    ...overrides,
  });
}

describe('sitePolicy', () => {
  it('ships defaults', () => {
    expect(DEFAULT_SITE_POLICY.pointRadiusFeet).toBe(50);
    expect(Object.isFrozen(DEFAULT_SITE_POLICY)).toBe(true);
  });

  it('merges an override', () => {
    expect(sitePolicy({ pointRadiusFeet: 75 }).corridorHalfWidthFeet).toBe(25);
  });

  it('rejects a size that is not a positive number', () => {
    expect(() => sitePolicy({ pointRadiusFeet: 0 })).toThrow(TicketError);
    expect(() => sitePolicy({ pointRadiusFeet: 'wide' })).toThrow(/above zero/);
  });
});

describe('extentFootage', () => {
  it('reads the footage a call taker typed', () => {
    expect(extentFootage('east 120 feet from the driveway')).toBe(120);
    expect(extentFootage('120FT east')).toBe(120);
    expect(extentFootage('1,320 feet')).toBe(1320);
  });

  it('finds nothing when there is none', () => {
    expect(extentFootage('the whole block')).toBeNull();
    expect(extentFootage(null)).toBeNull();
  });
});

describe('sitePoints', () => {
  it('reads the grid points', () => {
    expect(sitePoints(ticket({ points: [A, B] }))).toHaveLength(2);
  });

  it('reads none from a ticket with no site', () => {
    expect(sitePoints(ticket(null))).toEqual([]);
  });
});

describe('workAreaFor', () => {
  it('uses a drawn area as it stands', () => {
    const area = workAreaFor(ticket({ points: [A, B, C] }));
    expect(area.source).toBe('drawn');
    expect(area.ring).toHaveLength(4);
    expect(area.radiusFeet).toBeNull();
  });

  it('makes a corridor from two points', () => {
    const area = workAreaFor(ticket({ points: [A, B] }));
    expect(area.source).toBe('corridor');
    expect(area.radiusFeet).toBe(25);
    expect(ringContains(area.ring, destination(A, 60, 90))).toBe(true);
  });

  it('makes a disc from one point', () => {
    const area = workAreaFor(ticket({ points: [A] }, { extent: null }));
    expect(area.source).toBe('point');
    expect(area.radiusFeet).toBe(50);
    expect(distanceFeet(A, area.ring[0])).toBeCloseTo(50, 2);
  });

  it('sizes the disc from the extent when there is a footage', () => {
    const area = workAreaFor(ticket({ points: [A] }, { extent: 'north side east 120 feet' }));
    expect(area.source).toBe('extent');
    expect(area.radiusFeet).toBe(120);
  });

  it('clamps a wild footage to the policy ceiling', () => {
    const area = workAreaFor(ticket({ points: [A] }, { extent: '9000 feet of trench' }));
    expect(area.radiusFeet).toBe(1320);
  });

  it('honours a policy override', () => {
    const area = workAreaFor(ticket({ points: [A] }, { extent: null }), {
      policy: sitePolicy({ pointRadiusFeet: 90 }),
    });
    expect(area.radiusFeet).toBe(90);
  });

  it('has nothing to offer a ticket with no grids', () => {
    expect(workAreaFor(ticket(null))).toEqual({ ring: null, source: 'none', radiusFeet: null });
  });
});

describe('helpers over the work area', () => {
  it('says whether there is one at all', () => {
    expect(hasWorkArea(ticket({ points: [A] }))).toBe(true);
    expect(hasWorkArea(ticket(null))).toBe(false);
  });

  it('demands one when the caller cannot go on without it', () => {
    expect(requireWorkArea(ticket({ points: [A] })).source).toBe('point');
    expect(() => requireWorkArea(ticket(null))).toThrow(/no geometry to screen/);
  });

  it('measures the area', () => {
    const square = workAreaSquareFeet(ticket({ points: [A] }, { extent: null }));
    expect(square).toBeGreaterThan(7000);
    expect(square).toBeLessThan(8000);
    expect(workAreaSquareFeet(ticket(null))).toBeNull();
  });

  it('finds the middle', () => {
    const centre = workAreaCentre(ticket({ points: [A] }, { extent: null }));
    expect(centre.lat).toBeCloseTo(A.lat, 5);
    expect(workAreaCentre(ticket(null))).toBeNull();
  });
});
