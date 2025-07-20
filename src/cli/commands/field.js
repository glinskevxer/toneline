/**
 * Damage, coverage and the map.
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
export function registerFieldCommands(program, { writers, setExit }) {
  program
    .command('damage')
    .description('read the damage extract and report on it')
    .requiredOption('-d, --damages <path>', 'path to the damage extract')
    .option('-f, --feed <path>', 'path to the transmission feed, to count tickets')
    .option('-o, --out <path>', 'write the damage register to this file as csv')
    .option('--skip-bad', 'carry on past rows that will not read', false)
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { damages, failures } = tools.readDamageCsv(tools.readText(opts.damages), {
            skipBad: opts.skipBad,
          });
          const tickets = opts.feed
            ? tools.readFeed(opts.feed, { skipBad: true }).tickets.length
            : 0;
          const summary = tools.damageSummary(damages, { tickets });
          const rows = tools.buildDamageRegister(damages.map((damage) => ({ damage })));
          writers.write(
            tools.joinSections([
              tools.renderHeading(`${damages.length} damages`),
              tools.renderPairs({
                reportable: summary.reportable,
                withOutage: summary.withOutage,
                customersOut: summary.customersOut,
                ratePerThousand: summary.ratePerThousand,
              }),
              tools.renderTable(
                tools.topCounts(summary.byCause, 4).map((entry) => ({
                  cause: entry.key,
                  count: entry.count,
                })),
                [{ key: 'cause' }, { key: 'count', align: 'right' }]
              ),
              tools.renderTable(rows, [
                { key: 'id' },
                { key: 'at' },
                { key: 'facilityType', label: 'type' },
                { key: 'cause' },
                { key: 'responsible' },
                { key: 'customersOut', label: 'out', align: 'right' },
              ]),
              tools.renderPairs(tools.registerTotals(rows)),
            ])
          );
          for (const failure of failures) writers.warn(`row ${failure.row}: ${failure.message}`);
          if (opts.out) {
            const path = tools.writeText(opts.out, tools.writeDamageRegisterCsv(rows));
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
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const { tickets } = tools.readFeed(opts.feed, { skipBad: true });
          const context = tools.screeningContext(desk);
          const entries = tickets.map((ticket) => ({
            ticket,
            screening: tools.screenTicket(ticket, context),
          }));
          const report = tools.coverageReport(desk.network, entries);
          const sections = [
            tools.renderHeading(`coverage over ${report.tickets} tickets`),
            tools.renderPairs({
              ours: report.ours,
              outside: report.outside,
              facilities: report.facilities,
              touched: report.touched,
              touchedShare: report.touchedShare,
            }),
            tools.renderTable(
              report.outsideByPlace.map((place) => ({
                place: place.place,
                tickets: place.tickets.length,
              })),
              [{ key: 'place' }, { key: 'tickets', align: 'right' }]
            ),
          ];
          if (opts.quality) {
            const problems = tools.checkNetwork(desk.network);
            const advice = tools.tuningAdvice(desk.network);
            sections.push(
              tools.renderPairs({
                cellDegrees: advice.cellDegrees,
                recommended: advice.recommended,
                averagePerCell: advice.averagePerCell,
                grid: advice.advice,
              }),
              tools.renderPairs(tools.networkProfile(desk.network).byType),
              tools.renderTable(
                problems.problems.map((entry) => ({
                  id: entry.id,
                  problems: entry.problems.join('; '),
                })),
                [{ key: 'id' }, { key: 'problems', width: 60 }]
              )
            );
          }
          writers.write(tools.joinSections(sections));
          for (const place of tools.suspectPlaces(report)) {
            writers.warn(`${place.tickets.length} tickets came in for ${place.place}`);
          }
          return 0;
        })
      );
    });

  program
    .command('map')
    .description('write the network and the tickets out as geojson')
    .requiredOption('-c, --config <path>', 'path to the configuration file')
    .option('-f, --feed <path>', 'path to the transmission feed')
    .option('-o, --out <path>', 'write the geojson to this file')
    .option('--only <what>', 'network, tickets or both', 'both')
    .action((opts) => {
      setExit(
        tools.runCommand(writers, () => {
          const { desk } = tools.openDesk(opts.config);
          const tickets = opts.feed ? tools.readFeed(opts.feed, { skipBad: true }).tickets : [];
          const only = String(opts.only).toLowerCase();
          if (!['network', 'tickets', 'both'].includes(only)) {
            writers.warn(`--only must be network, tickets or both, not ${opts.only}`);
            return 1;
          }
          if (only !== 'network' && tickets.length === 0 && !opts.feed) {
            writers.warn('no feed was given, so there are no tickets to draw');
          }
          const site = desk.policies.site;
          let geo;
          if (only === 'network') geo = tools.networkCollection(desk.network);
          else if (only === 'tickets') geo = tools.ticketCollection(tickets, { site });
          else geo = tools.deskCollection(desk.network, tickets, { site });

          if (opts.out) {
            const path = tools.writeJson(opts.out, geo);
            writers.line(`wrote ${geo.features.length} features to ${path}`);
            return 0;
          }
          writers.line(JSON.stringify(geo));
          return 0;
        })
      );
    });
}
