# toneline

One call locate ticket handling for underground facility operators.

An operator that owns buried plant has to answer every excavation notice the
one call centre sends it: work out when digging may lawfully start, decide
whether anything of theirs is close enough to matter, get somebody to the site,
tell the centre what happened, and be able to prove all of it two years later.
`toneline` is the desk that does that.

## What it covers

- **Transmissions.** Reads the centre's labelled text format, including
  continuation lines and multiple pairs on one line, into validated tickets.
- **Lawful start.** Full business days against a configured holiday calendar,
  with the centre's daily cutoff, per ticket type.
- **Screening.** Dig site geometry against a facility network, on a grid index,
  with the tolerance zone taken from the facility type or the record itself.
- **Response.** Picks a positive response code from the screening, per facility
  type, and holds a clock that never runs past the lawful start.
- **Dispatch.** Skills, districts, daily capacity, day routing against deadlines,
  reassignment and escalation.
- **Damage.** Reports, root cause coding, cost sheets, claims, investigations
  and the register the regulator asks for.
- **Money.** Contract rates with premiums, monthly invoicing, service credits
  for late work, and reconciliation against the contractor's statement.

## Using it

```
npm install
npm test

node bin/toneline.js validate -c examples/cross-timbers.json --strict
node bin/toneline.js screen   -c examples/cross-timbers.json -f examples/march-2024.feed
node bin/toneline.js respond  -c examples/cross-timbers.json -f examples/march-2024.feed \
    -a 2024-03-14T08:00 -b desk
node bin/toneline.js brief    -c examples/cross-timbers.json -f examples/march-2024.feed \
    -a 2024-03-15T09:00
```

`examples/` holds a worked desk: an operator configuration, a facility extract,
a feed of four tickets, a damage extract and a locator roster. Every command
runs against it, and so does CI.

## The commands

| command      | what it does                                                  |
| ------------ | ------------------------------------------------------------- |
| `validate`   | check a configuration and its facility extract                |
| `screen`     | screen a feed against the network and recommend a code        |
| `respond`    | answer a feed and write the postings out                      |
| `find`       | find a ticket from part of a number, a street or an excavator |
| `age`        | show the open work against its response deadlines             |
| `queue`      | order the open work the way it should be driven               |
| `brief`      | the morning brief for the supervisor                          |
| `exceptions` | everything on the desk that needs a person                    |
| `capacity`   | say whether the day fits the roster                           |
| `book`       | post a day of work into the desk journal                      |
| `register`   | build the ticket register the regulator asks for              |
| `invoice`    | build the monthly locating invoice                            |
| `month`      | assemble the monthly pack                                     |
| `damage`     | read the damage extract and report on it                      |
| `coverage`   | plant that never comes up, and tickets that are not ours      |
| `map`        | write the network and the tickets out as geojson              |

Every command takes `-c` for the configuration. Most take `-f` for a feed, which
may be either the centre's transmission format or a csv export: the format is
taken from the file name, and `--format` overrides it.

## How it is laid out

| directory       | what is in it                                                  |
| --------------- | -------------------------------------------------------------- |
| `src/core`      | errors, field coercion, ticket numbering                       |
| `src/time`      | civil dates, timestamps, business day calendars, working hours |
| `src/geo`       | points, bounds, segments, rings and buffers                    |
| `src/text`      | street and contact normalising                                 |
| `src/io`        | csv, the transmission format, files, extracts                  |
| `src/ticket`    | the ticket record, lawful start, expiry, work area, priority   |
| `src/network`   | facilities, districts, the grid index, plant changes           |
| `src/screening` | screening, explanation, rescreening, coverage                  |
| `src/response`  | codes, postings, the clock, compliance, amendments             |
| `src/dispatch`  | roster, assignment, routing, escalation, timesheets            |
| `src/damage`    | reports, root cause, cost, investigations, statistics          |
| `src/billing`   | rates, invoices, credits, statement reconciliation             |
| `src/reporting` | ageing, indicators, registers, briefs, trends, tables          |
| `src/store`     | ticket and posting stores, the journal, the desk book          |
| `src/cli`       | the command line                                               |

Tests live in `tests/`, mirroring `src/`, plus `tests/integration` for the runs
that go end to end.

## Conventions

- Dates are `YYYY-MM-DD`, timestamps are `YYYY-MM-DDTHH:MM`, both civil: no
  offsets, no instants, because every rule in this domain is stated in local
  wall clock time.
- Records are built through one function each, validated once, and frozen.
- Money is held in whole cents wherever it is added up.
- Nothing throws a bare `Error`; every deliberate failure carries a code and a
  details bag naming what went wrong.
