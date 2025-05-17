import { describe, expect, it } from 'vitest';
import {
  RouteError,
  DEFAULT_ROUTE_POLICY,
  routePolicy,
  buildStop,
  planRoute,
  routeMetres,
  routeMinutes,
  routeSummary,
  overdueStops,
} from '../../src/dispatch/route.js';
import { destination } from '../../src/geo/point.js';
import { PolicyError } from '../../src/config/policies.js';

const BASE = { lat: 35.4676, lon: -97.5164 };
const NEAR = destination(BASE, 500, 90);
const MID = destination(BASE, 2000, 90);
const FAR = destination(BASE, 6000, 90);

function stop(number, dueAt, at) {
  return { number, dueAt, at };
}

describe('routePolicy', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_ROUTE_POLICY.slackMinutes).toBe(120);
    expect(routePolicy({ slackMinutes: 30 }).minutesOnSite).toBe(20);
  });

  it('rejects a value that is not above zero', () => {
    expect(() => routePolicy({ slackMinutes: 0 })).toThrow(PolicyError);
    expect(() => routePolicy({ averageSpeedKph: 'fast' })).toThrow(/above zero/);
  });
});

describe('buildStop', () => {
  it('reads a stop', () => {
    const built = buildStop(stop('b1', '2024-03-15T10:00', NEAR));
    expect(built.number).toBe('B1');
    expect(built.at.lat).toBeCloseTo(NEAR.lat, 9);
  });

  it('accepts the place under either key', () => {
    expect(buildStop({ number: 'b1', dueAt: '2024-03-15T10:00', point: NEAR }).at).toBeDefined();
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildStop(null)).toThrow(RouteError);
  });

  it('rejects a missing or bad deadline', () => {
    expect(() => buildStop({ number: 'b1', at: NEAR })).toThrow(/needs a deadline/);
    expect(() => buildStop({ number: 'b1', dueAt: '2024-03-15', at: NEAR })).toThrow(/deadline/);
  });
});

describe('planRoute', () => {
  it('honours the deadline order when nothing is slack', () => {
    const route = planRoute(
      [
        stop('B3', '2024-03-15T15:00', NEAR),
        stop('B1', '2024-03-15T09:00', FAR),
        stop('B2', '2024-03-15T12:00', MID),
      ],
      { start: BASE, policy: routePolicy({ slackMinutes: 1 }) }
    );
    expect(route.map((entry) => entry.number)).toEqual(['B1', 'B2', 'B3']);
  });

  it('takes the nearest of the stops inside the slack window', () => {
    const route = planRoute(
      [
        stop('B1', '2024-03-15T09:00', FAR),
        stop('B2', '2024-03-15T10:00', NEAR),
        stop('B3', '2024-03-15T10:30', MID),
      ],
      { start: BASE, policy: routePolicy({ slackMinutes: 120 }) }
    );
    expect(route.map((entry) => entry.number)).toEqual(['B2', 'B3', 'B1']);
  });

  it('will not reach past the slack window', () => {
    const route = planRoute(
      [stop('B1', '2024-03-15T09:00', FAR), stop('B2', '2024-03-15T14:00', NEAR)],
      { start: BASE, policy: routePolicy({ slackMinutes: 60 }) }
    );
    expect(route[0].number).toBe('B1');
  });

  it('falls back to deadline order with no starting place', () => {
    const route = planRoute([
      stop('B2', '2024-03-15T10:00', NEAR),
      stop('B1', '2024-03-15T09:00', FAR),
    ]);
    expect(route.map((entry) => entry.number)).toEqual(['B1', 'B2']);
  });

  it('breaks a deadline tie on the ticket number', () => {
    const route = planRoute([
      stop('B2', '2024-03-15T09:00', NEAR),
      stop('B1', '2024-03-15T09:00', NEAR),
    ]);
    expect(route[0].number).toBe('B1');
  });

  it('plans nothing from nothing', () => {
    expect(planRoute([])).toEqual([]);
  });
});

describe('measuring a route', () => {
  const route = planRoute(
    [stop('B1', '2024-03-15T09:00', NEAR), stop('B2', '2024-03-15T10:00', MID)],
    {
      start: BASE,
    }
  );

  it('adds up the driving', () => {
    expect(routeMetres(route, BASE)).toBeCloseTo(2000, 0);
    expect(routeMetres(route)).toBeCloseTo(1500, 0);
    expect(routeMetres([])).toBe(0);
  });

  it('adds time on site to the driving time', () => {
    const minutes = routeMinutes(route, { start: BASE });
    expect(minutes).toBeGreaterThan(40);
    expect(minutes).toBeLessThan(50);
  });

  it('summarises a route', () => {
    const summary = routeSummary(route, { start: BASE });
    expect(summary.stops).toBe(2);
    expect(summary.firstDue).toBe('2024-03-15T09:00');
    expect(summary.lastDue).toBe('2024-03-15T10:00');
  });

  it('summarises an empty route', () => {
    expect(routeSummary([])).toEqual({
      stops: 0,
      metres: 0,
      minutes: 0,
      firstDue: null,
      lastDue: null,
    });
  });

  it('names the stops already past their deadline', () => {
    expect(overdueStops(route, '2024-03-15T09:30').map((entry) => entry.number)).toEqual(['B1']);
    expect(overdueStops(route, '2024-03-15T08:00')).toEqual([]);
  });
});
