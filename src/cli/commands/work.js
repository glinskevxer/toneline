/**
 * What the desk is holding and what it did with it.
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
export function registerWorkCommands(program, { writers, setExit }) {
  program
    .command('age')
    .description('show the open work against its response deadlines')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-a, --at <stamp>', 'the moment the screen is drawn')
    .option('--all', 'include tickets that are already answered or closed', false)
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const wanted = opts.all ? tickets : tools.openTickets(tickets);
          const rows = tools.ageTickets(wanted, { at: opts.at, ...tools.schedulingContext(desk) });
          writers.write(
            tools.joinSections([
              tools.renderHeading(`open work at ${opts.at}`),
              tools.renderPairs(tools.bucketCounts(rows)),
              tools.renderTable(rows, [
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
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const context = tools.screeningContext(desk);
          const entries = tools.openTickets(tickets).map((ticket) => ({
            ticket,
            screening: tools.screenTicket(ticket, context),
          }));
          const scored = tools.orderQueue(entries, {
            at: opts.at,
            ...tools.schedulingContext(desk),
          });
          const top = scored.slice(0, Math.max(0, Number(opts.top) || 0));
          writers.write(
            tools.joinSections([
              tools.renderHeading(`work queue at ${opts.at}`),
              tools.renderPairs(tools.bandCounts(scored)),
              tools.renderTable(top, [
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
    .command('brief')
    .description('the morning brief for the supervisor')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-a, --at <stamp>', 'the moment the brief is drawn')
    .option('--json', 'print the brief as json instead of a table', false)
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const brief = tools.buildBrief({ desk, tickets, at: opts.at });
          if (opts.json) {
            writers.line(JSON.stringify(brief, null, 2));
            return 0;
          }
          writers.write(
            tools.joinSections([
              tools.renderHeading(`${brief.operator} at ${brief.at}`),
              `${tools.briefHeadline(brief)}\n`,
              tools.renderPairs(tools.briefNumbers(brief)),
              tools.renderTable(brief.queue, [
                { key: 'number', label: 'ticket' },
                { key: 'type' },
                { key: 'band' },
                { key: 'dueAt', label: 'due' },
                { key: 'minutesLeft', label: 'mins left', align: 'right' },
              ]),
              brief.escalations.length === 0
                ? ''
                : tools.renderTable(
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
    .command('book')
    .description('post a day of work into the desk journal')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-j, --journal <path>', 'path to the desk journal')
    .requiredOption('-a, --at <stamp>', 'the moment the work was done')
    .requiredOption('-b, --by <who>', 'who did it')
    .option('--dry-run', 'say what would be posted without writing anything', false)
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const book = tools.openBookFile(opts.journal);
          const before = book.counts();
          const session = tools.answerBatch(tickets, { desk, at: opts.at, by: opts.by });

          tickets.forEach((ticket, index) => {
            book.addTicket(ticket);
            book.note({
              at: opts.at,
              subject: ticket.number,
              action: 'screened',
              by: opts.by,
              detail: tools.explanationDetail(session.screenings[index]),
            });
          });
          for (const posting of session.postings) book.addResponse(posting);

          const after = book.counts();
          writers.write(
            tools.joinSections([
              tools.renderHeading(`posting ${tickets.length} tickets`),
              tools.renderPairs({
                excavations: `${before.excavations} to ${after.excavations}`,
                responses: `${before.responses} to ${after.responses}`,
                audit: `${before.audit} to ${after.audit}`,
              }),
            ])
          );
          if (opts.dryRun) {
            writers.line('dry run, nothing was written');
            return 0;
          }
          const path = tools.saveBookFile(opts.journal, book);
          writers.line(`wrote the journal to ${path}`);
          return 0;
        })
      );
    });

  program
    .command('capacity')
    .description('say whether the day fits the roster')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .requiredOption('-f, --feed <path>', 'path to the transmission feed')
    .requiredOption('-r, --roster <path>', 'path to the locator roster as json')
    .option('-a, --at <stamp>', 'the day being planned')
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const roster = tools.buildRoster(tools.readJson(opts.roster));
          const context = tools.screeningContext(desk);
          const entries = tickets.map((ticket) => ({
            ticket,
            screening: tools.screenTicket(ticket, context),
          }));
          const plan = tools.planDay(entries, roster, {
            date: opts.at ? opts.at.slice(0, 10) : undefined,
          });
          writers.write(
            tools.joinSections([
              tools.renderHeading(`capacity for ${plan.date ?? 'the day'}`),
              tools.renderPairs({
                tickets: plan.demand.tickets,
                capacity: plan.supply.total,
                fits: plan.fits,
              }),
              tools.renderTable(
                Object.entries(plan.demand.byType).map(([type, needed]) => ({
                  skill: type,
                  needed,
                  available: plan.supply.byType[type] ?? 0,
                })),
                [
                  { key: 'skill' },
                  { key: 'needed', align: 'right' },
                  { key: 'available', align: 'right' },
                ]
              ),
              `${tools.shortfallLines(plan).join('\n')}\n`,
              tools.renderTable(tools.whoIsFree(roster, { date: plan.date ?? '2024-01-01' }), [
                { key: 'locatorId', label: 'locator' },
                { key: 'free', align: 'right' },
              ]),
            ])
          );
          return plan.fits ? 0 : 0;
        })
      );
    });
}
