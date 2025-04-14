/**
 * The documents that leave the desk.
 *
 * Commands are registered onto the program rather than built here, so the
 * program stays the one place that knows what the whole tool looks like.
 */

import * as tools from './toolbox.js';

/**
 * Register these commands.
 *
 * @param {import('commander').Command} program
 * @param {object} wiring the writers and the exit hook
 */
export function registerRecordsCommands(program, { writers, setExit }) {
  program
    .command('register')
    .description('build the ticket register the regulator asks for')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .option('-a, --at <stamp>', 'answer the feed at this moment first')
    .option('-o, --out <path>', 'write the register to this file as csv')
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const session = opts.at
            ? tools.answerBatch(tickets, { desk, at: opts.at, by: 'register' })
            : { postings: [] };
          const rows = tools.buildRegister(tickets, {
            responses: session.postings,
            ...tools.expiryContext(desk),
          });
          writers.write(
            tools.joinSections([
              tools.renderHeading(`register of ${rows.length} tickets`),
              tools.renderPairs(tools.responseCodeCounts(rows)),
              tools.renderTable(rows, [
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
            const path = tools.writeText(opts.out, tools.writeRegisterCsv(rows));
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
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const session = tools.answerBatch(tickets, { desk, at: opts.at, by: 'invoice' });
          const invoice = tools.buildInvoice({
            period: opts.period,
            tickets,
            responses: session.postings,
            rates: tools.buildRates(desk.policies.billing ?? {}),
          });
          writers.write(
            tools.joinSections([
              tools.renderHeading(`invoice for ${invoice.period}`),
              tools.renderTable(invoice.lines, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'footage', align: 'right' },
                { key: 'multiplier', align: 'right' },
                { key: 'amount', align: 'right' },
              ]),
              tools.renderPairs({
                ...tools.invoiceByType(invoice),
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
    .command('month')
    .description('assemble the monthly pack')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-p, --period <month>', 'the month to pack, as YYYY-MM')
    .requiredOption('-a, --at <stamp>', 'the moment the desk answered the feed')
    .option('-d, --damages <path>', 'path to the damage extract')
    .option('--json', 'print the pack as json instead of lines', false)
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const damages = opts.damages
            ? tools.readDamageCsv(tools.readText(opts.damages), { skipBad: true }).damages
            : [];
          const session = tools.answerBatch(tickets, { desk, at: opts.at, by: 'month' });
          const compliance = tools.evaluateBatch(
            tickets.map((ticket, index) => ({
              ticket,
              responses: session.postings,
              screening: session.screenings[index],
            })),
            { at: opts.at, ...tools.schedulingContext(desk) }
          );
          const pack = tools.monthlyPack({
            period: opts.period,
            desk,
            tickets,
            responses: session.postings,
            compliance,
            damages,
          });
          if (opts.json) {
            writers.line(JSON.stringify(pack, null, 2));
            return 0;
          }
          writers.write(
            tools.joinSections([
              tools.renderHeading(`monthly pack ${pack.period}`),
              `${tools.packLines(pack).join('\n')}\n`,
              tools.renderPairs(tools.packHeadlines(pack)),
              tools.renderTable(
                pack.incoming.worst.map((entry) => ({
                  warning: entry.warning,
                  count: entry.count,
                })),
                [
                  { key: 'warning', width: 56 },
                  { key: 'count', align: 'right' },
                ]
              ),
            ])
          );
          return 0;
        })
      );
    });
}
