/**
 * Telling people about a damage.
 *
 * Three notices go out and they are not the same document. The centre gets a
 * short structured block. The excavator gets what they hit and what happens
 * next. The regulator gets a report, and only for the damages that reach the
 * threshold, so the notice builder refuses to write one that is not owed.
 */

import { deepFreeze, requireString } from '../core/fields.js';
import { formatCentreStamp } from '../time/formats.js';
import { facilityType } from '../ticket/types.js';
import { DamageError, isReportable } from './report.js';
import { classifyDamage } from './rootCause.js';

/** Who a notice can be addressed to. */
export const NOTICE_AUDIENCES = Object.freeze(['CENTRE', 'EXCAVATOR', 'REGULATOR']);

/** The block the centre reads. */
export function centreNotice(damage, { operator }) {
  const lines = [
    `DAMAGE: ${damage.id}`,
    `MEMBER: ${requireString(operator, 'operator')}`,
    `OCCURRED: ${formatCentreStamp(damage.at)}`,
    `FACILITY: ${damage.facilityType}`,
    `TICKET: ${damage.ticketNumber ?? 'NONE ON FILE'}`,
    `EXCAVATOR: ${damage.excavator ?? 'NOT GIVEN'}`,
    `METHOD: ${damage.method}`,
    `MARKED: ${damage.marksPresent ? 'Y' : 'N'}  ACCURATE: ${accurate(damage)}`,
    `SERVICE OUT: ${damage.serviceInterrupted ? 'Y' : 'N'}  CUSTOMERS: ${damage.customersOut}`,
  ];
  return `${lines.join('\n')}\n`;
}

function accurate(damage) {
  if (damage.marksAccurate === null) return 'UNKNOWN';
  return damage.marksAccurate ? 'Y' : 'N';
}

/** The letter the excavator gets. */
export function excavatorNotice(damage, { operator, claim = null }) {
  const cause = classifyDamage(damage);
  const label = facilityType(damage.facilityType).label;
  const lines = [
    `${requireString(operator, 'operator')} damage notice ${damage.id}`,
    `On ${formatCentreStamp(damage.at)} a ${label} of ours was struck by ${damage.method.toLowerCase()}.`,
  ];
  lines.push(
    damage.ticketNumber === null
      ? 'We hold no locate ticket for this excavation.'
      : `The excavation was notified on ticket ${damage.ticketNumber}.`
  );
  lines.push(`Our finding is ${cause.code.toLowerCase()}: ${cause.reason}.`);
  if (damage.serviceInterrupted) {
    lines.push(`${damage.customersOut} customers lost service.`);
  }
  if (cause.recoverable) {
    lines.push(
      claim === null
        ? 'The cost of the repair will be put to you once it is known.'
        : `The cost of the repair is ${claim.amount.toFixed(2)} under claim ${claim.reference}.`
    );
  } else {
    lines.push('No cost is being put to you for this damage.');
  }
  return `${lines.join('\n')}\n`;
}

/** The report the regulator gets, which is only owed on some damages. */
export function regulatorNotice(damage, { operator, sheet = null }) {
  if (!isReportable(damage)) {
    throw new DamageError('this damage does not meet the reporting threshold', { id: damage.id });
  }
  const cause = classifyDamage(damage);
  const lines = [
    `OPERATOR: ${requireString(operator, 'operator')}`,
    `INCIDENT: ${damage.id}`,
    `OCCURRED: ${formatCentreStamp(damage.at)}`,
    `COMMODITY: ${facilityType(damage.facilityType).label}`,
    `ROOT CAUSE: ${cause.code}`,
    `INJURY: ${damage.injury ? 'Y' : 'N'}  IGNITION: ${damage.ignition ? 'Y' : 'N'}`,
    `CUSTOMERS AFFECTED: ${damage.customersOut}`,
  ];
  if (sheet !== null) lines.push(`COST: ${sheet.total.toFixed(2)}`);
  if (damage.narrative !== null) lines.push(`NARRATIVE: ${damage.narrative}`);
  return `${lines.join('\n')}\n`;
}

/**
 * Build every notice that is owed on a damage.
 *
 * @returns {object} a frozen record of what to send where
 */
export function noticesFor(damage, args) {
  const notices = {
    CENTRE: centreNotice(damage, args),
    EXCAVATOR: excavatorNotice(damage, args),
    REGULATOR: null,
  };
  if (isReportable(damage)) notices.REGULATOR = regulatorNotice(damage, args);
  return deepFreeze({
    id: damage.id,
    owed: NOTICE_AUDIENCES.filter((audience) => notices[audience] !== null),
    notices,
  });
}
