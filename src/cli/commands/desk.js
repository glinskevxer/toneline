/**
 * Reading the feed and answering it.
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
export function registerDeskCommands(program, { writers, setExit }) {
  program
    .command('validate')
    .description('check an operator configuration and its facility extract')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .option('--strict', 'treat warnings as failures', false)
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk, facilitiesPath } = tools.openDesk(opts.config, {
            failOnWarning: opts.strict,
          });
          writers.write(
            tools.renderPairs({
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
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets, failures } = tools.readFeed(opts.feed, { skipBad: opts.skipBad });
          const context = tools.screeningContext(desk);
          const rows = tickets.map((ticket) => {
            const result = tools.screenTicket(ticket, context);
            const advice = tools.recommendResponse(ticket, result);
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
            tools.joinSections([
              tools.renderHeading(`screening ${rows.length} tickets`),
              tools.renderTable(rows, [
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
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets, failures } = tools.readFeed(opts.feed, { skipBad: opts.skipBad });
          const session = tools.answerBatch(tickets, {
            desk,
            at: opts.at,
            by: opts.by,
            meetTime: opts.meetTime,
          });
          const summary = tools.sessionSummary(session);
          writers.write(
            tools.joinSections([
              tools.renderHeading(`answered ${summary.tickets} tickets`),
              tools.renderPairs({
                postings: summary.postings,
                conflicts: summary.conflicts,
                held: summary.held,
              }),
              tools.renderTable(
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
            const path = tools.writeJson(opts.out, session.postings);
            writers.line(`wrote ${session.postings.length} postings to ${path}`);
          }
          return 0;
        })
      );
    });
}
