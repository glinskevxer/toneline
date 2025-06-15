/**
 * Everything that needs a person.
 *
 * The desk produces half a dozen separate lists of things that have gone wrong,
 * and a supervisor reading six lists reads none of them. This gathers them into
 * one, ranked, with the same shape per row whatever produced it, so the top of
 * the list is the next thing to do.
 */

import { deepFreeze } from '../core/fields.js';
import { exceptions as complianceExceptions } from '../response/compliance.js';
import { checkTickets } from '../ticket/validate.js';
import { escalations } from '../dispatch/escalation.js';
import { openDamages } from '../damage/register.js';
import { checkNetwork } from '../network/quality.js';

/** How the kinds of exception rank against each other. */
export const EXCEPTION_WEIGHTS = Object.freeze({
  escalation: 0,
  compliance: 10,
  damage: 20,
  ticket: 30,
  plant: 40,
});

/** Build one row, in the shape every source has to produce. */
export function exceptionRow({ kind, subject, summary, detail = null, weight = null }) {
  return deepFreeze({
    kind,
    subject: String(subject).toUpperCase(),
    summary,
    detail,
    weight: weight ?? EXCEPTION_WEIGHTS[kind] ?? 99,
  });
}

/**
 * Gather everything.
 *
 * Each source is optional, because a caller with no damages to hand should get
 * the rest rather than an error, and a caller with everything gets one list.
 *
 * @param {object} args
 * @returns {object} a frozen report
 */
export function exceptionReport(args = {}) {
  const {
    tickets = [],
    compliance = [],
    entries = [],
    damageRows = [],
    network = null,
    at = null,
    ...clockOptions
  } = args;
  const rows = [];

  if (entries.length > 0 && at !== null) {
    for (const record of escalations(entries, { at, ...clockOptions })) {
      rows.push(
        exceptionRow({
          kind: 'escalation',
          subject: record.number,
          summary: `escalate to ${record.level}`,
          detail: record.reasons.join('; '),
        })
      );
    }
  }
  for (const record of complianceExceptions(compliance)) {
    rows.push(
      exceptionRow({
        kind: 'compliance',
        subject: record.number,
        summary: record.status,
        detail: record.minutesLate === null ? null : `${record.minutesLate} minutes late`,
      })
    );
  }
  for (const row of openDamages(damageRows)) {
    rows.push(
      exceptionRow({
        kind: 'damage',
        subject: row.id,
        summary: `investigation ${row.investigation}`,
        detail: `due ${row.investigationDue}`,
      })
    );
  }
  for (const entry of checkTickets(tickets)) {
    rows.push(
      exceptionRow({
        kind: 'ticket',
        subject: entry.number,
        summary: `${entry.warnings.length} problems with the ticket as it came in`,
        detail: entry.warnings[0],
      })
    );
  }
  if (network !== null) {
    for (const entry of checkNetwork(network).problems) {
      rows.push(
        exceptionRow({
          kind: 'plant',
          subject: entry.id,
          summary: `${entry.problems.length} problems with the record`,
          detail: entry.problems[0],
        })
      );
    }
  }

  rows.sort(
    (left, right) =>
      left.weight - right.weight ||
      left.kind.localeCompare(right.kind) ||
      left.subject.localeCompare(right.subject)
  );
  return deepFreeze({ rows, counts: countByKind(rows), total: rows.length });
}

function countByKind(rows) {
  const counts = Object.fromEntries(Object.keys(EXCEPTION_WEIGHTS).map((kind) => [kind, 0]));
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return counts;
}

/** The head of the list, which is what a supervisor reads first. */
export function nextActions(report, limit = 5) {
  return report.rows.slice(0, Math.max(0, limit));
}

/** Only the rows of one kind. */
export function ofKind(report, kind) {
  return report.rows.filter((row) => row.kind === kind);
}

/** A line per row for the brief. */
export function exceptionLines(report, limit = 10) {
  return nextActions(report, limit).map((row) =>
    row.detail === null
      ? `${row.subject}: ${row.summary}`
      : `${row.subject}: ${row.summary} (${row.detail})`
  );
}
