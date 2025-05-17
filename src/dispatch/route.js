/**
 * Ordering a locator's day.
 *
 * Two things pull against each other here. Tickets have deadlines and the
 * earliest has to be honoured, but driving the day in deadline order can mean
 * crossing town and back several times. The compromise is a slack window: from
 * the stops whose deadline falls within a set number of minutes of the earliest
 * one still outstanding, take the nearest.
 */

import { TonelineError } from '../core/errors.js';
import { aboveZero, definePolicy } from '../config/policies.js';
import { distanceMetres, toPoint } from '../geo/point.js';
import { compareStamps, isStamp, minutesBetween } from '../time/stamp.js';

/** Raised when a route cannot be planned. */
export class RouteError extends TonelineError {
  constructor(message, details = {}) {
    super('ROUTE_INVALID', message, details);
  }
}

/** The default shape of a locator's driving day. */
export const DEFAULT_ROUTE_POLICY = Object.freeze({
  slackMinutes: 120,
  averageSpeedKph: 32,
  minutesOnSite: 20,
});

/** Merge a partial route policy over the defaults. */
export const routePolicy = definePolicy(DEFAULT_ROUTE_POLICY, {
  slackMinutes: aboveZero,
  averageSpeedKph: aboveZero,
  minutesOnSite: aboveZero,
});

/** Build one stop, which is a place with a deadline on it. */
export function buildStop(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new RouteError('a stop must be built from an object', { type: typeof raw });
  }
  if (!isStamp(raw.dueAt)) {
    throw new RouteError('a stop needs a deadline', { number: raw.number, dueAt: raw.dueAt });
  }
  return {
    number: String(raw.number ?? '').toUpperCase(),
    dueAt: raw.dueAt,
    at: toPoint(raw.at ?? raw.point),
  };
}

/**
 * Put a day's stops in the order they should be driven.
 *
 * @param {object[]} stops the stops to order
 * @param {object} [options]
 * @param {object} [options.start] where the locator starts the day
 * @param {object} [options.policy] route policy
 * @returns {object[]} the stops in driving order
 */
export function planRoute(stops, options = {}) {
  const policy = options.policy ?? DEFAULT_ROUTE_POLICY;
  const remaining = stops.map(buildStop);
  if (remaining.length === 0) return [];
  const ordered = [];
  let here = options.start === undefined || options.start === null ? null : toPoint(options.start);
  while (remaining.length > 0) {
    remaining.sort(
      (left, right) =>
        compareStamps(left.dueAt, right.dueAt) || left.number.localeCompare(right.number)
    );
    const earliest = remaining[0].dueAt;
    const eligible = remaining.filter(
      (stop) => minutesBetween(earliest, stop.dueAt) <= policy.slackMinutes
    );
    const next =
      here === null
        ? eligible[0]
        : eligible.reduce((best, stop) =>
            distanceMetres(here, stop.at) < distanceMetres(here, best.at) ? stop : best
          );
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    here = next.at;
  }
  return ordered;
}

/** Metres driven over a route, including the run out from the base. */
export function routeMetres(route, start = null) {
  let total = 0;
  let here = start === null ? null : toPoint(start);
  for (const stop of route) {
    if (here !== null) total += distanceMetres(here, stop.at);
    here = stop.at;
  }
  return total;
}

/** Minutes the route is expected to take, driving plus time on site. */
export function routeMinutes(route, options = {}) {
  const policy = options.policy ?? DEFAULT_ROUTE_POLICY;
  const metres = routeMetres(route, options.start ?? null);
  const driving = (metres / 1000 / policy.averageSpeedKph) * 60;
  return driving + route.length * policy.minutesOnSite;
}

/** A short summary of a planned route. */
export function routeSummary(route, options = {}) {
  return {
    stops: route.length,
    metres: routeMetres(route, options.start ?? null),
    minutes: routeMinutes(route, options),
    firstDue: route.length === 0 ? null : route[0].dueAt,
    lastDue: route.length === 0 ? null : route[route.length - 1].dueAt,
  };
}

/** Stops whose deadline has already passed at a given moment. */
export function overdueStops(route, at) {
  return route.filter((stop) => compareStamps(stop.dueAt, at) < 0);
}
