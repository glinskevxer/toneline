/**
 * Positive response codes.
 *
 * The operator has to tell the centre what it did about every ticket, in the
 * centre's own code set. The code decides three separate things, and they do
 * not always move together: whether the excavator may dig, whether the ticket
 * is finished with, and whether somebody still has to go back out.
 */

import { TonelineError } from '../core/errors.js';

/** Raised when a response code or a posting cannot be used. */
export class ResponseError extends TonelineError {
  constructor(message, details = {}) {
    super('RESPONSE_INVALID', message, details);
  }
}

const RESPONSE_LIST = [
  {
    code: '1',
    key: 'NO_FACILITIES',
    label: 'no facilities in the work area',
    clearsToDig: true,
    closesTicket: true,
    needsFollowUp: false,
    requiresMarks: false,
  },
  {
    code: '2',
    key: 'MARKED',
    label: 'facilities marked',
    clearsToDig: true,
    closesTicket: true,
    needsFollowUp: false,
    requiresMarks: true,
  },
  {
    code: '3',
    key: 'PART_MARKED',
    label: 'marked in part, the rest to follow',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: true,
  },
  {
    code: '4',
    key: 'MEET_SCHEDULED',
    label: 'meet arranged with the excavator',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: false,
  },
  {
    code: '5',
    key: 'MEET_HELD',
    label: 'meet held and the work area agreed',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: false,
  },
  {
    code: '6',
    key: 'NO_ACCESS',
    label: 'could not get to the work area',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: false,
  },
  {
    code: '7',
    key: 'CRITICAL',
    label: 'critical facility, meet before digging',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: true,
  },
  {
    code: '8',
    key: 'ABANDONED_ONLY',
    label: 'abandoned facilities only, nothing marked',
    clearsToDig: true,
    closesTicket: true,
    needsFollowUp: false,
    requiresMarks: false,
  },
  {
    code: '9',
    key: 'NOT_OURS',
    label: 'outside our district, no facilities of ours',
    clearsToDig: true,
    closesTicket: true,
    needsFollowUp: false,
    requiresMarks: false,
  },
  {
    code: '10',
    key: 'DELAYED',
    label: 'marking delayed, the excavator has been told',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: false,
  },
  {
    code: '11',
    key: 'AGREED_LATER',
    label: 'the excavator agreed a later date',
    clearsToDig: false,
    closesTicket: false,
    needsFollowUp: true,
    requiresMarks: false,
  },
];

const BY_CODE = new Map(RESPONSE_LIST.map((entry) => [entry.code, Object.freeze(entry)]));
const BY_KEY = new Map(RESPONSE_LIST.map((entry) => [entry.key, BY_CODE.get(entry.code)]));

/** Every response code, in the order the centre lists them. */
export const RESPONSE_CODES = Object.freeze(RESPONSE_LIST.map((entry) => entry.code));

/** Every response key, which is what the library uses internally. */
export const RESPONSE_KEYS = Object.freeze(RESPONSE_LIST.map((entry) => entry.key));

/** Look a response up by its centre code or by its key. */
export function responseCode(value) {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();
  const found = BY_CODE.get(text) ?? BY_KEY.get(text.replace(/[\s-]+/g, '_'));
  if (!found) {
    throw new ResponseError('response code is not one the centre accepts', {
      value,
      known: RESPONSE_CODES,
    });
  }
  return found;
}

/** True when the value names a response code. */
export function isResponseCode(value) {
  try {
    responseCode(value);
    return true;
  } catch {
    return false;
  }
}

/** True when a response with this code lets the excavator break ground. */
export function clearsToDig(value) {
  return responseCode(value).clearsToDig;
}

/** True when a response with this code finishes the desk's work. */
export function closesTicket(value) {
  return responseCode(value).closesTicket;
}

/** Every code that leaves somebody with more to do. */
export function followUpCodes() {
  return RESPONSE_LIST.filter((entry) => entry.needsFollowUp).map((entry) => entry.code);
}
