/**
 * The command line.
 *
 * One program object built per invocation so nothing is held between runs and
 * the tests can drive it with their own streams. Commands do as little as
 * possible themselves: they read arguments, call the library and print.
 */

import { Command } from 'commander';
import { makeWriters, openDesk, readFeed, runCommand } from './context.js';
import { screeningContext } from '../config/load.js';
import { screenTicket } from '../screening/screen.js';
import { recommendResponse } from '../response/decide.js';
import { renderPairs, renderTable, joinSections, renderHeading } from '../reporting/table.js';
import { answerBatch, sessionSummary } from '../response/session.js';
import { writeJson } from '../io/files.js';
import { schedulingContext } from '../config/load.js';
import { ageTickets, bucketCounts, openTickets } from '../reporting/aging.js';
import { bandCounts, orderQueue } from '../ticket/priority.js';
import { expiryContext } from '../config/load.js';
import { buildRegister, responseCodeCounts, writeRegisterCsv } from '../reporting/register.js';
import { buildInvoice, invoiceByType } from '../billing/invoice.js';
import { buildRates } from '../billing/rates.js';
import { writeText } from '../io/files.js';
import { briefHeadline, briefNumbers, buildBrief } from '../reporting/brief.js';
import { readDamageCsv } from '../io/damages.js';
import { readText } from '../io/files.js';
import { buildDamageRegister, registerTotals, writeDamageRegisterCsv } from '../damage/register.js';
import { damageSummary, topCounts } from '../damage/stats.js';
import { coverageReport, suspectPlaces } from '../screening/coverage.js';
import { checkNetwork, networkProfile } from '../network/quality.js';

/**
 * Build the program.
 *
 * @param {object} [options]
 * @param {NodeJS.WritableStream} [options.out]
 * @param {NodeJS.WritableStream} [options.err]
 * @param {Function} [options.exit] called with the exit code
 */
export function buildProgram(options = {}) {
  const writers = makeWriters(options);
  const setExit = options.exit ?? (() => {});
  const program = new Command();

  program
    .name('toneline')
    .description('one call locate ticket handling for underground facility operators')
    .version('0.1.0')
    .configureOutput({
      writeOut: (text) => writers.write(text),
      writeErr: (text) => writers.warn(text.replace(/\n$/, '')),
    })
    .exitOverride();

  program
    .command('validate')
    .description('check an operator configuration and its facility extract')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .option('--strict', 'treat warnings as failures', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk, facilitiesPath } = openDesk(opts.config, { failOnWarning: opts.strict });
          writers.write(
            renderPairs({
              operator: desk.operator.name,
              centre: desk.centre.name ?? desk.centre.prefix,
              districts: desk.districts.length,
              facilities: desk.network.size,
              extract: facilitiesPath ?? 'none',
            })
          );
          for (const warning of desk.warnings) writers.warn(`warning: ${warning}`);
          return 0;
        })
      );
    });

  program
    .command('screen')
    .description('screen a feed of tickets against the network')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .option('--skip-bad', 'carry on past blocks that will not read', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets, failures } = readFeed(opts.feed, { skipBad: opts.skipBad });
          const context = screeningContext(desk);
          const rows = tickets.map((ticket) => {
            const result = screenTicket(ticket, context);
            const advice = recommendResponse(ticket, result);
            return {
              number: ticket.number,
              type: ticket.type,
              districts: result.districts.join(' ') || '-',
              hits: result.hits.length,
              conflict: result.conflict,
              code: advice.code,
              reason: advice.reason,
            };
          });
          writers.write(
            joinSections([
              renderHeading(`screening ${rows.length} tickets`),
              renderTable(rows, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'districts' },
                { key: 'hits', align: 'right' },
                { key: 'conflict' },
                { key: 'code', align: 'right' },
                { key: 'reason', width: 44 },
              ]),
            ])
          );
          for (const failure of failures) {
            writers.warn(`block ${failure.block}: ${failure.message}`);
          }
          return 0;
        })
      );
    });

  program
    .command('respond')
    .description('answer a feed and write the postings out')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-a, --at <stamp>', 'the moment the desk is answering')
    .requiredOption('-b, --by <who>', 'who is answering')
    .option('-o, --out <path>', 'write the postings to this file as json')
    .option('--meet-time <clock>', 'the clock time a meet is offered at', '08:00')
    .option('--skip-bad', 'carry on past blocks that will not read', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets, failures } = readFeed(opts.feed, { skipBad: opts.skipBad });
          const session = answerBatch(tickets, {
            desk,
            at: opts.at,
            by: opts.by,
            meetTime: opts.meetTime,
          });
          const summary = sessionSummary(session);
          writers.write(
            joinSections([
              renderHeading(`answered ${summary.tickets} tickets`),
              renderPairs({
                postings: summary.postings,
                conflicts: summary.conflicts,
                held: summary.held,
              }),
              renderTable(
                Object.entries(summary.codes).map(([code, count]) => ({ code, count })),
                [
                  { key: 'code', align: 'right' },
                  { key: 'count', align: 'right' },
                ]
              ),
            ])
          );
          for (const entry of session.held) writers.warn(`held ${entry.number}: ${entry.reason}`);
          for (const failure of failures) {
            writers.warn(`block ${failure.block}: ${failure.message}`);
          }
          if (opts.out) {
            const path = writeJson(opts.out, session.postings);
            writers.line(`wrote ${session.postings.length} postings to ${path}`);
          }
          return 0;
        })
      );
    });

  program
    .command('age')
    .description('show the open work against its response deadlines')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-a, --at <stamp>', 'the moment the screen is drawn')
    .option('--all', 'include tickets that are already answered or closed', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets } = readFeed(opts.feed, { skipBad: true });
          const wanted = opts.all ? tickets : openTickets(tickets);
          const rows = ageTickets(wanted, { at: opts.at, ...schedulingContext(desk) });
          writers.write(
            joinSections([
              renderHeading(`open work at ${opts.at}`),
              renderPairs(bucketCounts(rows)),
              renderTable(rows, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'status' },
                { key: 'dueAt', label: 'due' },
                { key: 'minutesLeft', label: 'mins left', align: 'right' },
                { key: 'bucket' },
              ]),
            ])
          );
          return 0;
        })
      );
    });

  program
    .command('queue')
    .description('order the open work the way it should be driven')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-a, --at <stamp>', 'the moment the queue is built')
    .option('-n, --top <count>', 'how many rows to print', '20')
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets } = readFeed(opts.feed, { skipBad: true });
          const context = screeningContext(desk);
          const entries = openTickets(tickets).map((ticket) => ({
            ticket,
            screening: screenTicket(ticket, context),
          }));
          const scored = orderQueue(entries, { at: opts.at, ...schedulingContext(desk) });
          const top = scored.slice(0, Math.max(0, Number(opts.top) || 0));
          writers.write(
            joinSections([
              renderHeading(`work queue at ${opts.at}`),
              renderPairs(bandCounts(scored)),
              renderTable(top, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'band' },
                { key: 'dueAt', label: 'due' },
                { key: 'minutesLeft', label: 'mins left', align: 'right' },
                { key: 'reason', width: 42 },
              ]),
            ])
          );
          return 0;
        })
      );
    });

  program
    .command('register')
    .description('build the ticket register the regulator asks for')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .option('-a, --at <stamp>', 'answer the feed at this moment first')
    .option('-o, --out <path>', 'write the register to this file as csv')
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets } = readFeed(opts.feed, { skipBad: true });
          const session = opts.at
            ? answerBatch(tickets, { desk, at: opts.at, by: 'register' })
            : { postings: [] };
          const rows = buildRegister(tickets, {
            responses: session.postings,
            ...expiryContext(desk),
          });
          writers.write(
            joinSections([
              renderHeading(`register of ${rows.length} tickets`),
              renderPairs(responseCodeCounts(rows)),
              renderTable(rows, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'lawfulStartAt', label: 'lawful start' },
                { key: 'expiresOn', label: 'expires' },
                { key: 'responseCode', label: 'code', align: 'right' },
                { key: 'address', width: 26 },
              ]),
            ])
          );
          if (opts.out) {
            const path = writeText(opts.out, writeRegisterCsv(rows));
            writers.line(`wrote ${rows.length} rows to ${path}`);
          }
          return 0;
        })
      );
    });

  program
    .command('invoice')
    .description('build the monthly locating invoice')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-p, --period <month>', 'the month to bill, as YYYY-MM')
    .requiredOption('-a, --at <stamp>', 'the moment the desk answered the feed')
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets } = readFeed(opts.feed, { skipBad: true });
          const session = answerBatch(tickets, { desk, at: opts.at, by: 'invoice' });
          const invoice = buildInvoice({
            period: opts.period,
            tickets,
            responses: session.postings,
            rates: buildRates(desk.policies.billing ?? {}),
          });
          writers.write(
            joinSections([
              renderHeading(`invoice for ${invoice.period}`),
              renderTable(invoice.lines, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'footage', align: 'right' },
                { key: 'multiplier', align: 'right' },
                { key: 'amount', align: 'right' },
              ]),
              renderPairs({
                ...invoiceByType(invoice),
                subtotal: invoice.subtotal,
                minimum: invoice.minimumTopUp,
                total: invoice.total,
              }),
            ])
          );
          for (const entry of invoice.skipped) {
            writers.warn(`skipped ${entry.number}: ${entry.reason}`);
          }
          return 0;
        })
      );
    });

  program
    .command('brief')
    .description('the morning brief for the supervisor')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-a, --at <stamp>', 'the moment the brief is drawn')
    .option('--json', 'print the brief as json instead of a table', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets } = readFeed(opts.feed, { skipBad: true });
          const brief = buildBrief({ desk, tickets, at: opts.at });
          if (opts.json) {
            writers.line(JSON.stringify(brief, null, 2));
            return 0;
          }
          writers.write(
            joinSections([
              renderHeading(`${brief.operator} at ${brief.at}`),
              `${briefHeadline(brief)}\n`,
              renderPairs(briefNumbers(brief)),
              renderTable(brief.queue, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'band' },
                { key: 'dueAt', label: 'due' },
                { key: 'minutesLeft', label: 'mins left', align: 'right' },
              ]),
              brief.escalations.length === 0
                ? ''
                : renderTable(
                    brief.escalations.map((entry) => ({
                      number: entry.number,
                      level: entry.level,
                      why: entry.reasons.join('; '),
                    })),
                    [
                      { key: 'number', label: 'escalate' },
                      { key: 'level' },
                      { key: 'why', width: 48 },
                    ]
                  ),
            ])
          );
          return 0;
        })
      );
    });

  program
    .command('damage')
    .description('read the damage extract and report on it')
    .requiredOption('-d, --damages <path>', 'path to the damage extract')
    .option('-f, --feed <path>', 'path to the transmission feed, to count tickets')
    .option('-o, --out <path>', 'write the damage register to this file as csv')
    .option('--skip-bad', 'carry on past rows that will not read', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { damages, failures } = readDamageCsv(readText(opts.damages), {
            skipBad: opts.skipBad,
          });
          const tickets = opts.feed ? readFeed(opts.feed, { skipBad: true }).tickets.length : 0;
          const summary = damageSummary(damages, { tickets });
          const rows = buildDamageRegister(damages.map((damage) => ({ damage })));
          writers.write(
            joinSections([
              renderHeading(`${damages.length} damages`),
              renderPairs({
                reportable: summary.reportable,
                withOutage: summary.withOutage,
                customersOut: summary.customersOut,
                ratePerThousand: summary.ratePerThousand,
              }),
              renderTable(
                topCounts(summary.byCause, 4).map((entry) => ({
                  cause: entry.key,
                  count: entry.count,
                })),
                [{ key: 'cause' }, { key: 'count', align: 'right' }]
              ),
              renderTable(rows, [
                { key: 'id' },
                { key: 'at' },
                { key: 'facilityType', label: 'type' },
                { key: 'cause' },
                { key: 'responsible' },
                { key: 'customersOut', label: 'out', align: 'right' },
              ]),
              renderPairs(registerTotals(rows)),
            ])
          );
          for (const failure of failures) writers.warn(`row ${failure.row}: ${failure.message}`);
          if (opts.out) {
            const path = writeText(opts.out, writeDamageRegisterCsv(rows));
            writers.line(`wrote ${rows.length} rows to ${path}`);
          }
          return 0;
        })
      );
    });

  program
    .command('coverage')
    .description('report on plant that never comes up and tickets that are not ours')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .option('--quality', 'also check the plant extract for bad records', false)
    .action((opts) => {
      setExit(
        runCommand(writers, () => {
          const { desk } = openDesk(opts.config);
          const { tickets } = readFeed(opts.feed, { skipBad: true });
          const context = screeningContext(desk);
          const entries = tickets.map((ticket) => ({
            ticket,
            screening: screenTicket(ticket, context),
          }));
          const report = coverageReport(desk.network, entries);
          const sections = [
            renderHeading(`coverage over ${report.tickets} tickets`),
            renderPairs({
              ours: report.ours,
              outside: report.outside,
              facilities: report.facilities,
              touched: report.touched,
              touchedShare: report.touchedShare,
            }),
            renderTable(
              report.outsideByPlace.map((place) => ({
                place: place.place,
                tickets: place.tickets.length,
              })),
              [{ key: 'place' }, { key: 'tickets', align: 'right' }]
            ),
          ];
          if (opts.quality) {
            const problems = checkNetwork(desk.network);
            sections.push(
              renderPairs(networkProfile(desk.network).byType),
              renderTable(
                problems.problems.map((entry) => ({
                  id: entry.id,
                  problems: entry.problems.join('; '),
                })),
                [{ key: 'id' }, { key: 'problems', width: 60 }]
              )
            );
          }
          writers.write(joinSections(sections));
          for (const place of suspectPlaces(report)) {
            writers.warn(`${place.tickets.length} tickets came in for ${place.place}`);
          }
          return 0;
        })
      );
    });

  return program;
}

/**
 * Run the program against an argument list.
 *
 * @returns {Promise<number>} the exit code
 */
export async function run(argv, options = {}) {
  let code = 0;
  const program = buildProgram({
    ...options,
    exit: (value) => {
      code = value;
    },
  });
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') return 0;
    if (err.exitCode !== undefined) return err.exitCode;
    throw err;
  }
  return code;
}
