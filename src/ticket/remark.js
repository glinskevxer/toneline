/**
 * Remarks.
 *
 * Paint fades, flags get pulled out and a long job outlives its marks, so an
 * excavator can ask for the site to be marked again. The contract gives a
 * number of free remarks per excavation and charges after that, and a remark
 * only makes sense while the ticket is still alive and something was marked in
 * the first place.
 */

import { TicketError } from '../core/errors.js';
import { atOrAboveZero, definePolicy, wholeFromZero } from '../config/policies.js';
import { deepFreeze, optionalString, requireString } from '../core/fields.js';
import { addDays, compareDates } from '../time/date.js';
import { dateOf, isStamp } from '../time/stamp.js';
import { effectiveExpiry } from './expiry.js';

/** How many remarks the contract gives away before charging. */
export const DEFAULT_REMARK_POLICY = Object.freeze({
  freeRemarks: 2,
  chargeableRate: 35,
  minimumNoticeHours: 24,
});

/** Merge a partial remark policy over the defaults. */
export const remarkPolicy = definePolicy(DEFAULT_REMARK_POLICY, {
  freeRemarks: wholeFromZero,
  chargeableRate: atOrAboveZero,
  minimumNoticeHours: atOrAboveZero,
});

/** Build a remark request. */
export function buildRemark(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TicketError('a remark must be built from an object', { type: typeof raw });
  }
  const requestedAt = requireString(raw.requestedAt, 'requestedAt');
  if (!isStamp(requestedAt)) {
    throw new TicketError('a remark needs a timestamp', { requestedAt });
  }
  return deepFreeze({
    number: requireString(raw.number, 'number').toUpperCase(),
    requestedAt,
    requestedBy: requireString(raw.requestedBy, 'requestedBy'),
    reason: optionalString(raw.reason, 'reason', 'marks no longer visible'),
    scope: raw.scope === undefined || raw.scope === null ? 'ALL' : String(raw.scope).toUpperCase(),
  });
}

/**
 * Decide whether a remark can be worked.
 *
 * @returns {{allowed: boolean, reason: string|null, chargeable: boolean, sequence: number}}
 */
export function assessRemark(ticket, request, args = {}) {
  const { existing = [], responses = [], policy = DEFAULT_REMARK_POLICY, ...options } = args;
  const mine = existing.filter((entry) => entry.number === ticket.number);
  const sequence = mine.length + 1;
  const chargeable = sequence > policy.freeRemarks;

  if (['CANCELLED', 'VOID'].includes(ticket.status)) {
    return verdict(false, 'the ticket has been cancelled', chargeable, sequence);
  }
  const expires = effectiveExpiry(ticket, options);
  if (compareDates(dateOf(request.requestedAt), expires) > 0) {
    return verdict(false, 'the ticket has already expired', chargeable, sequence);
  }
  const marked = responses.filter(
    (response) => response.number === ticket.number && response.marksThrough !== null
  );
  if (marked.length === 0) {
    return verdict(false, 'nothing has been marked on this ticket yet', chargeable, sequence);
  }
  return verdict(true, null, chargeable, sequence);
}

function verdict(allowed, reason, chargeable, sequence) {
  return deepFreeze({ allowed, reason, chargeable, sequence });
}

/**
 * The date the refreshed marks are good through.
 *
 * The clock starts again from the day the remark was asked for, not from the
 * original marking, which is the whole point of asking for one.
 */
export function remarkMarksThrough(request, { markLifeDays = 14 } = {}) {
  if (!Number.isInteger(markLifeDays) || markLifeDays < 1) {
    throw new TicketError('mark life must be a whole number of days of one or more', {
      markLifeDays,
    });
  }
  return addDays(dateOf(request.requestedAt), markLifeDays - 1);
}

/** What a remark costs, which is nothing while the free ones last. */
export function remarkCharge(assessment, policy = DEFAULT_REMARK_POLICY) {
  return assessment.chargeable ? policy.chargeableRate : 0;
}

/** Every remark against one ticket, oldest first. */
export function remarksFor(remarks, number) {
  const wanted = String(number ?? '').toUpperCase();
  return remarks
    .filter((entry) => entry.number === wanted)
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
}
