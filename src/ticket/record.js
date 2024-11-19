/**
 * The ticket record.
 *
 * One frozen shape that every later stage reads. Building it is the only place
 * that decides what a ticket has to carry, so a bad transmission and a bad JSON
 * import fail in the same way with the same message.
 */

import { TicketError } from '../core/errors.js';
import {
  deepFreeze,
  isBlank,
  optionalBoolean,
  optionalList,
  optionalNumber,
  optionalString,
  requireString,
} from '../core/fields.js';
import { isStamp } from '../time/stamp.js';
import { isDate } from '../time/date.js';
import { parseTicketNumber } from '../core/ids.js';
import { ticketStatus, ticketType } from './types.js';
import { placeKey, normaliseStreet } from '../text/address.js';
import { tidyContact } from '../text/contact.js';

/**
 * @typedef {object} Ticket
 * @property {string} number the ticket number as transmitted
 * @property {string} base the revision free number, shared by a dig's history
 * @property {number} revision zero for the original transmission
 * @property {string} type ticket type code
 * @property {string} takenAt when the centre took the call
 * @property {string} status where the ticket sits on this desk
 */

/** Build a ticket from a loose record, validating every field. */
export function buildTicket(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TicketError('a ticket must be built from an object', { type: typeof raw });
  }
  const number = requireString(raw.number ?? raw.ticketNumber, 'number');
  const parts = parseTicketNumber(number);
  const type = ticketType(requireString(raw.type ?? raw.transmission, 'type')).code;
  const takenAt = requireString(raw.takenAt ?? raw.taken, 'takenAt');
  if (!isStamp(takenAt)) {
    throw new TicketError('takenAt must be a timestamp', { takenAt });
  }
  const expiresOn = optionalString(raw.expiresOn, 'expiresOn');
  if (expiresOn !== null && !isDate(expiresOn)) {
    throw new TicketError('expiresOn must be a calendar date', { expiresOn });
  }
  const lawfulStartAt = optionalString(raw.lawfulStartAt, 'lawfulStartAt');
  if (lawfulStartAt !== null && !isStamp(lawfulStartAt)) {
    throw new TicketError('lawfulStartAt must be a timestamp', { lawfulStartAt });
  }
  const address = optionalString(raw.address, 'address');
  const intersection = optionalString(raw.intersection, 'intersection');
  if (address === null && intersection === null) {
    throw new TicketError('a ticket needs an address or an intersection', { number });
  }

  const ticket = {
    number: parts.revision === 0 ? parts.base : number.trim().toUpperCase(),
    base: parts.base,
    revision: parts.revision,
    centre: parts.centre,
    type,
    takenAt,
    lawfulStartAt,
    expiresOn,
    state: optionalString(raw.state, 'state'),
    county: optionalString(raw.county, 'county'),
    place: optionalString(raw.place, 'place'),
    address,
    intersection,
    workType: optionalString(raw.workType, 'workType'),
    doneFor: optionalString(raw.doneFor, 'doneFor'),
    excavator: buildExcavator(raw.excavator),
    extent: optionalString(raw.extent, 'extent'),
    boring: optionalBoolean(raw.boring, 'boring'),
    blasting: optionalBoolean(raw.blasting, 'blasting'),
    whiteLined: optionalBoolean(raw.whiteLined, 'whiteLined'),
    depthFeet: optionalNumber(raw.depthFeet, 'depthFeet'),
    members: optionalList(raw.members, 'members').map((code) => code.toUpperCase()),
    site: raw.site ?? null,
    remarks: optionalString(raw.remarks, 'remarks'),
    status: ticketStatus(raw.status ?? 'RECEIVED'),
    receivedAt: optionalString(raw.receivedAt, 'receivedAt', takenAt),
  };
  if (!isStamp(ticket.receivedAt)) {
    throw new TicketError('receivedAt must be a timestamp', { receivedAt: ticket.receivedAt });
  }
  return deepFreeze(ticket);
}

/**
 * Read the excavator block.
 *
 * The contact details go through the same tidying every other part of the desk
 * uses, so a phone number typed six different ways dials the same either way.
 * A detail that will not tidy is kept as it was typed and noted, because losing
 * a half readable number is worse than carrying a doubtful one.
 */
function buildExcavator(raw) {
  if (isBlank(raw)) return null;
  if (typeof raw === 'string') {
    return { company: raw.trim(), contact: null, phone: null, email: null, contactProblems: [] };
  }
  if (typeof raw !== 'object') {
    throw new TicketError('excavator must be a name or a record', { type: typeof raw });
  }
  const contact = optionalString(raw.contact, 'excavator.contact');
  const phone = optionalString(raw.phone, 'excavator.phone');
  const email = optionalString(raw.email, 'excavator.email');
  const tidy = tidyContact({ name: contact, phone, email });
  return {
    company: requireString(raw.company ?? raw.name, 'excavator.company'),
    contact,
    phone: tidy.phone ?? phone,
    email: tidy.email ?? email,
    contactProblems: tidy.problems.filter((problem) => !problem.startsWith('no ')),
  };
}

/** The ticket type record behind a ticket. */
export function typeOf(ticket) {
  return ticketType(ticket.type);
}

/** True when the ticket calls for a locator on the ground. */
export function needsMarking(ticket) {
  return typeOf(ticket).requiresMarking && ticket.status !== 'CANCELLED';
}

/** A stable key for the place a ticket digs in, used by duplicate detection. */
export function siteKey(ticket) {
  const place = ticket.address === null ? '' : placeKey(ticket.address);
  const cross = ticket.intersection === null ? '' : normaliseStreet(ticket.intersection);
  return [ticket.place ?? '', place, cross].map((part) => part.toUpperCase()).join('|');
}

/** A short one line description for logs and reports. */
export function describeTicket(ticket) {
  const where = ticket.address ?? ticket.intersection ?? 'no location given';
  return `${ticket.number} ${ticket.type} ${where}`;
}

/** True when the excavator cannot be reached from what the ticket carries. */
export function isReachable(ticket) {
  const excavator = ticket.excavator;
  if (excavator === null) return false;
  if (excavator.contactProblems.length > 0) return false;
  return excavator.phone !== null || excavator.email !== null;
}

/** A copy of the ticket with some fields replaced, revalidated on the way. */
export function withTicketFields(ticket, changes) {
  return buildTicket({ ...ticket, ...changes });
}
