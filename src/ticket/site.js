/**
 * The work area.
 *
 * Screening needs a ring, and most tickets do not carry one. A ticket with
 * three or more grid points has a drawn area and is used as it stands. Two
 * points describe a run down a street and become a corridor. One point becomes
 * a disc, sized from the footage in the extent text when the call taker typed
 * one and from the policy default when they did not.
 */

import { TicketError } from '../core/errors.js';
import { bufferGeometry, discRing } from '../geo/buffer.js';
import { feetToMetres, toPoint } from '../geo/point.js';
import { ringAreaSquareFeet, ringCentroid, toRing } from '../geo/polygon.js';

/** The default sizes this desk grows a bare ticket to. */
export const DEFAULT_SITE_POLICY = Object.freeze({
  pointRadiusFeet: 50,
  corridorHalfWidthFeet: 25,
  maxRadiusFeet: 1320,
});

/** Merge a partial site policy over the defaults. */
export function sitePolicy(overrides = {}) {
  const policy = { ...DEFAULT_SITE_POLICY, ...overrides };
  for (const [key, value] of Object.entries(policy)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TicketError('site policy sizes must be numbers above zero', { key, value });
    }
  }
  return Object.freeze(policy);
}

const FOOTAGE = /(\d[\d,]*)\s*(?:feet|foot|ft\b)/i;

/** The footage a call taker typed into the extent, or null. */
export function extentFootage(text) {
  if (typeof text !== 'string') return null;
  const match = FOOTAGE.exec(text);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** The grid points a ticket carries, which may be none. */
export function sitePoints(ticket) {
  const points = ticket.site?.points ?? [];
  return points.map(toPoint);
}

/**
 * Work out the ring the desk screens against.
 *
 * @returns {{ring: object[]|null, source: string, radiusFeet: number|null}}
 */
export function workAreaFor(ticket, options = {}) {
  const policy = options.policy ?? DEFAULT_SITE_POLICY;
  const points = sitePoints(ticket);
  if (points.length >= 3) {
    return { ring: toRing(points), source: 'drawn', radiusFeet: null };
  }
  if (points.length === 2) {
    const halfWidth = policy.corridorHalfWidthFeet;
    return {
      ring: bufferGeometry(points, feetToMetres(halfWidth)),
      source: 'corridor',
      radiusFeet: halfWidth,
    };
  }
  if (points.length === 1) {
    const stated = extentFootage(ticket.extent);
    const radius = Math.min(stated ?? policy.pointRadiusFeet, policy.maxRadiusFeet);
    return {
      ring: discRing(points[0], feetToMetres(radius)),
      source: stated === null ? 'point' : 'extent',
      radiusFeet: radius,
    };
  }
  return { ring: null, source: 'none', radiusFeet: null };
}

/** True when the ticket carries enough geometry to screen against. */
export function hasWorkArea(ticket) {
  return sitePoints(ticket).length > 0;
}

/** The work area ring, throwing when the ticket has no geometry at all. */
export function requireWorkArea(ticket, options = {}) {
  const area = workAreaFor(ticket, options);
  if (area.ring === null) {
    throw new TicketError('the ticket carries no geometry to screen against', {
      number: ticket.number,
    });
  }
  return area;
}

/** Area of the work area in square feet, or null when there is none. */
export function workAreaSquareFeet(ticket, options = {}) {
  const area = workAreaFor(ticket, options);
  return area.ring === null ? null : ringAreaSquareFeet(area.ring);
}

/** The middle of the work area, or null when there is none. */
export function workAreaCentre(ticket, options = {}) {
  const area = workAreaFor(ticket, options);
  return area.ring === null ? null : ringCentroid(area.ring);
}
