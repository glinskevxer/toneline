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
