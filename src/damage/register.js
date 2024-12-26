/**
 * The damage register.
 *
 * The list the regulator asks for once a year and an investigator asks for the
 * morning after. One row per damage, carrying the facts, the coding, what it
 * cost and where the investigation stands, in the shape a spreadsheet can eat.
 */

import { deepFreeze } from '../core/fields.js';
import { writeCsv } from '../io/csv.js';
import { formatCentreStamp } from '../time/formats.js';
import { isReportable, sortDamages } from './report.js';
import { classifyDamage } from './rootCause.js';
import { investigationStatus } from './investigation.js';

/**
 * Build one register row.
 *
 * @param {object} damage
 * @param {object} [args]
 * @param {object} [args.sheet] the cost sheet, when there is one
 * @param {object} [args.investigation] the investigation, when one was opened
 * @param {string} [args.at] the moment the register is drawn
 */
export function damageRow(damage, args = {}) {
  const { sheet = null, investigation = null, at = null } = args;
  const cause = classifyDamage(damage);
  const status =
    investigation === null || at === null
      ? null
      : investigationStatus(damage, investigation, at.slice(0, 10));
  return deepFreeze({
    id: damage.id,
    at: damage.at,
    ticketNumber: damage.ticketNumber,
    facilityId: damage.facilityId,
    facilityType: damage.facilityType,
    excavator: damage.excavator,
    method: damage.method,
    cause: cause.code,
    responsible: cause.responsible,
    recoverable: cause.recoverable,
    reportable: isReportable(damage),
    serviceInterrupted: damage.serviceInterrupted,
    customersOut: damage.customersOut,
    injury: damage.injury,
    cost: sheet === null ? null : sheet.total,
    recoverableCost: sheet === null ? null : sheet.recoverableCents / 100,
    investigation: status === null ? null : status.state,
    investigationDue: status === null ? null : status.dueOn,
  });
}

/** Build the whole register, oldest first. */
export function buildDamageRegister(entries, args = {}) {
  const byId = new Map(entries.map((entry) => [entry.damage.id, entry]));
  return sortDamages(entries.map((entry) => entry.damage)).map((damage) => {
    const entry = byId.get(damage.id);
    return damageRow(damage, {
      ...args,
      sheet: entry.sheet ?? null,
      investigation: entry.investigation ?? null,
    });
  });
}

const COLUMNS = [
  'id',
  'at',
  'ticket',
  'facility',
  'type',
  'excavator',
  'method',
  'cause',
  'responsible',
  'reportable',
  'customers_out',
  'injury',
  'cost',
  'recoverable_cost',
  'investigation',
  'investigation_due',
];

/** Render the register as csv. */
export function writeDamageRegisterCsv(rows) {
  const records = rows.map((row) => ({
    id: row.id,
    at: formatCentreStamp(row.at),
    ticket: row.ticketNumber,
    facility: row.facilityId,
    type: row.facilityType,
    excavator: row.excavator,
    method: row.method,
    cause: row.cause,
    responsible: row.responsible,
    reportable: row.reportable ? 'Y' : 'N',
    customers_out: row.customersOut,
    injury: row.injury ? 'Y' : 'N',
    cost: row.cost,
    recoverable_cost: row.recoverableCost,
    investigation: row.investigation,
    investigation_due: row.investigationDue,
  }));
  return writeCsv(records, { columns: COLUMNS });
}

/** The rows that still need somebody, worst first. */
export function openDamages(rows) {
  return rows
    .filter((row) => row.investigation === 'overdue' || row.investigation === 'open')
    .sort((left, right) => left.investigationDue.localeCompare(right.investigationDue));
}

/** What the register adds up to. */
export function registerTotals(rows) {
  return {
    damages: rows.length,
    reportable: rows.filter((row) => row.reportable).length,
    ourFault: rows.filter((row) => row.responsible === 'operator').length,
    cost: round(rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)),
    recoverable: round(rows.reduce((sum, row) => sum + (row.recoverableCost ?? 0), 0)),
    customersOut: rows.reduce((sum, row) => sum + row.customersOut, 0),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
