# Security

## What this software holds

A locate desk holds three things worth thinking about:

- **Facility geometry.** Where the operator's plant is buried. Not secret, but
  not something to hand out either, and a system that leaks it wholesale is a
  system that has told somebody where the gas transmission main runs.
- **Excavator contact details.** Names, telephone numbers and email addresses of
  people at contractors, typed in by a call taker at the centre.
- **The audit trail.** The operator's own record of what it knew and when. It is
  read after damage, sometimes in a dispute, and its value depends entirely on
  nobody being able to change it quietly.

## What the library does about it

- Nothing here opens a socket, and nothing here calls out. Every input is a file
  or a value passed in, and every output is a file or a return value.
- The only dependency at runtime is `commander`, for argument parsing.
- The audit trail is append only in the code and hash chained in `audit/chain.js`,
  so an entry changed after the fact does not verify. That detects a change; it
  does not prevent one. Keeping the journal somewhere only the desk can write is
  still the operator's job.
- The journal is written to a temporary name and moved into place, so a machine
  that dies mid write leaves the previous journal whole.

## What it does not do

- There is no authentication and no authorisation. Anyone who can run the
  command line can read and write everything the configuration points at.
- Nothing is encrypted at rest. The journal, the extracts and the configuration
  are plain files.
- The `map` command writes facility geometry as GeoJSON. That file is as
  sensitive as the network it came from and should be treated that way.

## Reporting something

Open an issue with enough to reproduce it and no live data in it. If the finding
involves facility geometry or contact details, say so and leave the details out
of the issue itself.
