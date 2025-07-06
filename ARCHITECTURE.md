# How toneline is put together

## The shape of it

The library is layered, and the layers only ever point downwards:

```
cli ......... commands, argument parsing, printing
store ....... the book, the stores, the journal on disk
reporting ... ageing, indicators, registers, briefs, packs
billing ..... rates, invoices, credits, statements, periods
damage ...... reports, root cause, cost, investigations, notices
dispatch .... roster, assignment, routing, escalation, capacity
response .... codes, postings, clocks, compliance, transmission
screening ... screening, explanation, rescreening, coverage, depth
network ..... facilities, districts, the index, plant changes
ticket ...... the record, lawful start, expiry, work area, priority
io .......... csv, the transmission format, files, extracts, geojson
text ........ street and contact normalising
geo ......... points, bounds, segments, rings, buffers
time ........ dates, timestamps, calendars, working hours
core ........ errors, field coercion, ticket numbering, the clock
config ...... the schema, the loader, the policy helper
```

Nothing in `time` knows about tickets. Nothing in `ticket` knows about
dispatch. A module reaching sideways or upwards is the signal that something
belongs somewhere else.

## The decisions worth knowing about

**Civil dates and times, never instants.** Every rule in this domain is written
in local wall clock terms: two full business days, a response by five, marks
good for a fortnight. Storing an instant and converting would put a timezone
between the rule and the answer, so `time/date.js` and `time/stamp.js` work in
`YYYY-MM-DD` and `YYYY-MM-DDTHH:MM` and never build a `Date` for arithmetic.

**One builder per record, and the result is frozen.** A ticket, a facility, a
posting and a damage each have exactly one function that turns a loose object
into the real thing, validating as it goes. Callers never construct one by hand,
so there is one place where the rules about what a record must carry live.

**Policies are data.** Every calculation that could reasonably differ between
operators takes a policy bag with defaults, merged and checked through
`config/policies.js`. A new contract is a configuration change.

**Errors carry codes.** Nothing throws a bare `Error`. Each layer has its own
error class descending from `TonelineError`, with a stable `code` and a details
bag, so the command line can map a failure onto an exit status without matching
on message text.

**The index is a grid and nothing cleverer.** `network/network.js` keeps a
coarse cell grid and measures real distances only against the runs whose cells
the dig site touches. `tests/integration/scale.test.js` checks it against a full
scan over a generated city, which is the thing it is a faster version of.

**Postings supersede rather than change.** A correction is a new posting naming
the one it replaces. The first answer is what the excavator acted on, and that
is what an investigation needs to see.

## Where to start reading

`tests/integration/day.test.js` runs a whole day through the library in about a
hundred lines, and every module it touches is worth reading in the order it
touches them.
