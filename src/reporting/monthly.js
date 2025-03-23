/**
 * The monthly pack.
 *
 * The one document that goes to the operator's own management every month. It
 * is assembled from the same records the desk ran on, and it deliberately does
 * not recompute anything: if the pack and the daily screen disagree, that is a
 * bug in one of them and not a difference of method.
 */

import { deepFreeze } from '../core/fields.js';
import { dateOf } from '../time/stamp.js';
import { complianceSummary } from '../response/compliance.js';
import { damageSummary } from '../damage/stats.js';
import { deskIndicators } from './kpi.js';
import { buildInvoice, invoiceByType } from '../billing/invoice.js';
import { buildCreditNote } from '../billing/credits.js';
import { checkTickets, warningCounts } from '../ticket/validate.js';

const MONTH = /^\d{4}-\d{2}$/;

/** True when a timestamp falls in the month. */
export function inMonth(stamp, period) {
  return dateOf(stamp).slice(0, 7) === period;
}

/**
 * Assemble the pack.
 *
 * @param {object} args
 * @param {string} args.period the month as `YYYY-MM`
 * @param {object} args.desk the loaded desk
 * @param {object[]} args.tickets every ticket the desk holds
 * @param {object[]} args.responses every posting
 * @param {object[]} args.compliance the compliance records
 * @param {object[]} [args.damages] damages in the period
 */
export function monthlyPack({ period, desk, tickets, responses, compliance, damages = [] }) {
  if (!MONTH.test(String(period))) {
    throw new TypeError('a monthly pack needs a period in YYYY-MM form');
  }
  const mine = tickets.filter((ticket) => inMonth(ticket.receivedAt, period));
  const theirs = damages.filter((damage) => inMonth(damage.at, period));
  const numbers = new Set(mine.map((ticket) => ticket.number));
  const records = compliance.filter((record) => numbers.has(record.number));

  const invoice = buildInvoice({ period, tickets: mine, responses });
  const credits = buildCreditNote(invoice, records);
  const quality = checkTickets(mine);

  return deepFreeze({
    period,
    operator: desk.operator.name,
    tickets: mine.length,
    indicators: deskIndicators({ period, tickets: mine, compliance: records, damages: theirs }),
    compliance: complianceSummary(records),
    damages: damageSummary(theirs, { tickets: mine.length }),
    invoice: {
      lines: invoice.lines.length,
      subtotal: invoice.subtotal,
      total: invoice.total,
      byType: invoiceByType(invoice),
      credits: credits.applied,
      payable: credits.payable,
      capped: credits.capped,
    },
    incoming: {
      withWarnings: quality.length,
      cleanShare: mine.length === 0 ? 1 : (mine.length - quality.length) / mine.length,
      worst: warningCounts(quality).slice(0, 3),
    },
  });
}

/** The pack reduced to the handful of numbers that go on the front page. */
export function packHeadlines(pack) {
  return {
    tickets: pack.tickets,
    onTimeRate: pack.indicators.onTimeRate,
    damages: pack.damages.damages,
    damageRate: pack.damages.ratePerThousand,
    payable: pack.invoice.payable,
    cleanShare: pack.incoming.cleanShare,
  };
}

/** Line by line, in the order the pack is read. */
export function packLines(pack) {
  return [
    `${pack.operator}, ${pack.period}`,
    `${pack.tickets} tickets, ${pack.compliance.answered} answered, ${pack.compliance.late} late`,
    `on time ${(pack.indicators.onTimeRate * 100).toFixed(1)} per cent`,
    `${pack.damages.damages} damages at ${pack.damages.ratePerThousand.toFixed(2)} per thousand`,
    `invoice ${pack.invoice.total.toFixed(2)}, credits ${pack.invoice.credits.toFixed(2)}, payable ${pack.invoice.payable.toFixed(2)}`,
    `${pack.incoming.withWarnings} tickets came in with something wrong`,
  ];
}
