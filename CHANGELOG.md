# Changelog

## 1.0.0

The first release the desk can be run from end to end. Everything below has been
in use against the worked example in `examples/` since it was written.

### The desk

- Reads the one call centre's labelled transmission format, including
  continuation lines and several pairs on one line, and a csv export from a
  centre that sends one instead.
- Works out the lawful start from the waiting period on the ticket type, in full
  business days, against a configured holiday calendar and the centre's cutoff.
- Screens the work area against a facility network on a grid index sized from
  the plant, with the tolerance zone taken from the facility type or the record,
  and a depth check on top of the plan distance.
- Recommends a positive response code per facility type, holds a response clock
  that never runs past the lawful start, and measures compliance on the two
  questions a regulator asks separately.

### The people

- Roster with skills, districts and daily capacity; assignment, day routing
  against deadlines, reassignment with a limit on how often work can move, and
  escalation on the worst of three clocks.
- Capacity planning that says in the morning whether the day fits.
- Timesheets, and the productivity numbers the contract is measured on.

### After the fact

- Damage reports, root cause coding, cost sheets, claims, investigations with a
  clock, prevention actions, the three notices that are owed and the register the
  regulator asks for.
- Contract rates with premiums, monthly invoicing, service credits for late
  work, reconciliation against the contractor's statement, and period close.
- Ageing, indicators, briefs, exception lists, registers, monthly packs, trends
  and a density map.

### Keeping it

- A versioned journal, written through a temporary file so a machine that dies
  mid write leaves yesterday's whole.
- The audit trail is hash chained, and a journal that no longer matches the
  digest it was written with is refused rather than loaded quietly.
