/**
 * The vocabulary a locate desk works in.
 *
 * Ticket type drives the whole downstream calculation, so it is a registry with
 * the waiting period and the response window attached rather than a bare string
 * that every module has to remember the rules for.
 */

import { TicketError } from '../core/errors.js';
import { normaliseCode } from '../core/fields.js';

/**
 * @typedef {object} TicketType
 * @property {string} code short code as it appears on a transmission
 * @property {string} label human readable name
 * @property {number} waitBusinessDays full business days before digging may start
 * @property {number} responseHours hours allowed to post a positive response
 * @property {boolean} clockRunsOnWorkingHours whether the response clock pauses overnight
 * @property {boolean} requiresMarking whether the facility must be marked on the ground
 * @property {boolean} extendable whether the ticket can be renewed before it expires
 * @property {number} rank ordering for dispatch, lower is more urgent
 */

const TICKET_TYPE_LIST = [
  {
    code: 'NORMAL',
    label: 'normal notice',
    waitBusinessDays: 2,
    responseHours: 48,
    clockRunsOnWorkingHours: false,
    requiresMarking: true,
    extendable: true,
    rank: 50,
  },
  {
    code: 'EMERGENCY',
    label: 'emergency notice',
    waitBusinessDays: 0,
    responseHours: 2,
    clockRunsOnWorkingHours: false,
    requiresMarking: true,
    extendable: false,
    rank: 0,
  },
  {
    code: 'SHORT',
    label: 'short notice',
    waitBusinessDays: 1,
    responseHours: 24,
    clockRunsOnWorkingHours: false,
    requiresMarking: true,
    extendable: false,
    rank: 20,
  },
  {
    code: 'MEET',
    label: 'meet request',
    waitBusinessDays: 2,
    responseHours: 48,
    clockRunsOnWorkingHours: true,
    requiresMarking: true,
    extendable: true,
    rank: 30,
  },
  {
    code: 'DESIGN',
    label: 'design request',
    waitBusinessDays: 10,
    responseHours: 240,
    clockRunsOnWorkingHours: true,
    requiresMarking: false,
    extendable: false,
    rank: 90,
  },
  {
    code: 'SECOND',
    label: 'second notice',
    waitBusinessDays: 0,
    responseHours: 24,
    clockRunsOnWorkingHours: false,
    requiresMarking: true,
    extendable: false,
    rank: 10,
  },
  {
    code: 'DAMAGE',
    label: 'damage notification',
    waitBusinessDays: 0,
    responseHours: 2,
    clockRunsOnWorkingHours: false,
    requiresMarking: false,
    extendable: false,
    rank: 0,
  },
  {
    code: 'UPDATE',
    label: 'update or extension',
    waitBusinessDays: 0,
    responseHours: 48,
    clockRunsOnWorkingHours: false,
    requiresMarking: true,
    extendable: true,
    rank: 40,
  },
  {
    code: 'CANCEL',
    label: 'cancellation',
    waitBusinessDays: 0,
    responseHours: 0,
    clockRunsOnWorkingHours: false,
    requiresMarking: false,
    extendable: false,
    rank: 99,
  },
];

const TICKET_TYPES = new Map(TICKET_TYPE_LIST.map((type) => [type.code, Object.freeze(type)]));

/** Every ticket type code the library understands. */
export const TICKET_TYPE_CODES = Object.freeze(TICKET_TYPE_LIST.map((type) => type.code));

/** Look a ticket type up, throwing when it is not one we handle. */
export function ticketType(code) {
  const found = TICKET_TYPES.get(normaliseCode(code));
  if (!found) {
    throw new TicketError('ticket type is not one this desk handles', {
      code,
      known: TICKET_TYPE_CODES,
    });
  }
  return found;
}

/** True when the code names a ticket type. */
export function isTicketType(code) {
  return TICKET_TYPES.has(normaliseCode(code));
}

/** Ticket types that put a locator on the ground. */
export function markingTicketTypes() {
  return TICKET_TYPE_LIST.filter((type) => type.requiresMarking).map((type) => type.code);
}

const FACILITY_TYPE_LIST = [
  { code: 'GAS', label: 'natural gas', colour: 'yellow', toleranceFeet: 18, critical: true },
  { code: 'ELECTRIC', label: 'electric power', colour: 'red', toleranceFeet: 18, critical: true },
  { code: 'WATER', label: 'potable water', colour: 'blue', toleranceFeet: 24, critical: false },
  { code: 'SEWER', label: 'sanitary sewer', colour: 'green', toleranceFeet: 24, critical: false },
  { code: 'TELECOM', label: 'telephone', colour: 'orange', toleranceFeet: 18, critical: false },
  { code: 'FIBRE', label: 'fibre optic', colour: 'orange', toleranceFeet: 18, critical: true },
  { code: 'CATV', label: 'cable television', colour: 'orange', toleranceFeet: 18, critical: false },
  { code: 'STEAM', label: 'steam main', colour: 'yellow', toleranceFeet: 24, critical: true },
  {
    code: 'PETROLEUM',
    label: 'petroleum pipeline',
    colour: 'yellow',
    toleranceFeet: 36,
    critical: true,
  },
  { code: 'SIGNAL', label: 'traffic signal', colour: 'orange', toleranceFeet: 18, critical: false },
];

const FACILITY_TYPES = new Map(FACILITY_TYPE_LIST.map((type) => [type.code, Object.freeze(type)]));

/** Every facility type code the library understands. */
export const FACILITY_TYPE_CODES = Object.freeze(FACILITY_TYPE_LIST.map((type) => type.code));

/** Look a facility type up, throwing when it is unknown. */
export function facilityType(code) {
  const found = FACILITY_TYPES.get(normaliseCode(code));
  if (!found) {
    throw new TicketError('facility type is not one this operator carries', {
      code,
      known: FACILITY_TYPE_CODES,
    });
  }
  return found;
}

/** True when the code names a facility type. */
export function isFacilityType(code) {
  return FACILITY_TYPES.has(normaliseCode(code));
}

/** Facility types whose damage is reportable to the regulator. */
export function criticalFacilityTypes() {
  return FACILITY_TYPE_LIST.filter((type) => type.critical).map((type) => type.code);
}

/** The states a ticket moves through on this desk. */
export const TICKET_STATUSES = Object.freeze([
  'RECEIVED',
  'SCREENED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESPONDED',
  'CLOSED',
  'CANCELLED',
  'VOID',
]);

/** Normalise a status, throwing when it is not one of ours. */
export function ticketStatus(value) {
  const key = normaliseCode(value, { separator: '_' });
  if (!TICKET_STATUSES.includes(key)) {
    throw new TicketError('ticket status is not one this desk uses', {
      value,
      known: TICKET_STATUSES,
    });
  }
  return key;
}
