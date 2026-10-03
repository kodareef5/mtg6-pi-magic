# Game state, export, rollback, and watching a game

A note on where this is going, written before any of it is built, because the
storage shape has to be right now and the hosting can wait.

Four things are wanted:

1. The operator can export a game.
2. A game has an id and a URL, and somebody can watch a JSON object change as
   the game goes on.
3. A game can be rolled back to any point.
4. A game can be copied from that point and played on differently.

## Why these are nearly free already

The core was built so that every change goes through one door and is recorded.
That gives three properties, and the four wants above are what those properties
are for.

- The log is the game. A receipt per committed group, in order, with the reason
  and the facts read before it.
- The ledger is every decision and its pick, with whether it was forced,
  delegated, chosen or declared.
- The seed and a call counter are the only randomness, so a shuffle replays.

So a game is a header plus an ordered list of entries. Rolling back is reading
fewer entries. Copying is copying a prefix. Neither needs an undo path in the
engine, which is the expensive way to get the same thing.

## The file

One journal per game, append-only, one JSON object per line.

```
{"header": { id, format, seed, seats, cards, rules, created, forkedFrom? }}
{"v":1,"receipt":{...}}
{"v":1,"row":{...}}
{"v":2,"receipt":{...}}
```

Append-only matters more than it sounds. It survives a crash with at most a
partial last line, it streams to a static file host without a database, it
diffs against another game in a text diff, and truncating it is a rollback.

`cards` and `rules` in the header name the data files and their dates. A set
release changes oracle text, and a replay against different text is a different
game. Pinning them is the difference between a replay and an approximation.

### Why not SQLite

`node:sqlite` is built in and works on Node 26, so it would cost no dependency.
It is still the wrong first choice. It buys random access and queries across
many games, and neither is needed to export, roll back or copy one game. A
journal is the thing being served and the thing being truncated, so making it
the stored form removes a translation step rather than adding one.

When there is a reason to query across games, which means a game browser or
statistics, SQLite is the answer and the journals stay the source of truth.

## What this is mostly for

Two uses, and the second is the one that shapes the work.

**Rolling back a live game, by agreement.** Every remaining seat agrees to a
declared point and the game continues from there. A rollback is itself a
recorded event, so the journal says that one happened and where it went back
to. Nobody gets to pretend it did not. This matters because a seat that saw a
card has not unseen it in the room, only in the record, and the agreement is
what makes that acceptable rather than a hole. A rollback without every
remaining seat agreeing is not a feature, it is a corrupted game.

**Hunting interesting games and freezing them as benchmarks.** Run a great many
one on one games, find the positions worth studying, and keep those exact
setups as fixtures that a later change has to still handle. This is the main
use, and it costs almost nothing extra: a fixture is a journal prefix, so
copying a game at the interesting version already produces one. There is no
second file format for benchmarks and there should never be.

What a benchmark needs that an export does not: the same fixture played again
by a different decider, with the counters compared. The ledger already
separates forced, delegated, chosen and declared, which is the comparison that
matters most, because a change that quietly turns forced steps into asked ones
costs money without losing a game.

## Rollback and copy

Rollback to version N: read the header, replay entries up to N. Replay demands
determinism, which the core already requires. Canonical option ordering, the
recorded seed, no decision site holding state outside the table. The ledger
supplies the picks, so a replay needs no model at all. `scriptedPlayer` exists
for exactly this.

Copy from version N: a new id, the same header with `forkedFrom` recording
where it came from, and the first N entries copied. Play on from there with
live players. Two copies share a prefix, so the difference between two lines of
play is a diff of two files.

## Export has three modes, and only one is publishable

The journal holds everything, including every hand and every library. It is
private. What gets published is a projection, never the state.

- `full`. Everything. The operator only. This is the journal.
- `seat <n>`. What that seat knew at that version, including what it had
  legitimately seen and what it could infer. For handing a game back to a
  player to review. It is built from that seat's knowledge, not from the truth.
- `public`. What a spectator may see. The only one safe to put on a URL.

The projection boundary in `src/core/view.ts` already does this work per seat. A
spectator is one more viewer with no private entitlements, so `project` takes a
viewer rather than a seat.

Publishing a sequence of public projections is safe by construction, because
each one was filtered before it was written. Publishing the journal is not safe
and no amount of care at the edge fixes it.

## The layout that works everywhere

Make every version an immutable document and the current version a one-line
pointer.

```
/g/<id>/head          one line: the current version
/g/<id>/<v>.json      the public projection at version v, never changes
/g/<id>/meta.json     format, seats, names, start time
```

A version file can be cached forever. Only `head` is uncached, and it is a few
bytes. Watching a game is polling `head` and fetching a version when it moves.
Rolling back is reading an older file that is already there.

This layout is identical on a local server, through a tunnel, and in object
storage, which means the hosting choice stops being a rewrite.

### Polling, not streaming

Server-Sent Events are explicitly not supported through a Cloudflare Quick
Tunnel, and a WebSocket means either a dependency or writing RFC 6455 framing.
A game is turn based. A spectator polling a few bytes every second or two is
not a compromise, it is the right size of mechanism, and it works unchanged on
every host below.

## Hosting options

Researched rather than assumed. The facts below are Cloudflare's own, and their
free tiers move, so check before relying on a number.

**A. Export only.** `/magic export` writes the journal and a chosen projection
to a file. No server, no account, nothing to run. This is what to build first,
it satisfies wants 1, 3 and 4, and it is all a benchmark run ever needs.

**B. A local HTTP server in the plugin.** `node:http` on 127.0.0.1, serving the
layout above. Zero dependencies. A Pi extension can hold a listening socket:
`pi-link` runs a WebSocket server in the Pi process, started on `session_start`
and closed on `session_shutdown`. Good for watching on the same machine.

**C. B plus a Cloudflare Quick Tunnel.** `cloudflared tunnel --url
http://127.0.0.1:PORT` gives a public `https://<random>.trycloudflare.com`
with no Cloudflare account. What it costs: the hostname changes every run, 200
in-flight requests then a 429, no Server-Sent Events, no uptime guarantee, and
Cloudflare states plainly it is for testing and development. It needs the
`cloudflared` binary, which is a system dependency and not an npm one. The game
must still be running for the link to work.

**D. Push projections to R2 and serve them with a Worker.** Needs a free
Cloudflare account. The free tier is 10GB of storage and 1M operations a month,
so one PUT per version is nothing: a 300 version game is 300 operations. A
finished game stays viewable with no local process. This is the first option
that gives a link worth sending to somebody.

Workers KV is the wrong store here. Its free tier allows 1,000 writes a day,
which is three or four games.

**E. A Durable Object per game.** Durable Objects are on the Workers free plan
now, with 1M requests a month. The object holds the public state and spectators
talk to the Worker, so the game survives Pi being closed and live spectating
costs no polling of a file. The most capable option, and the most tied to one
vendor. Worth it only if many people watch one game at once.

**F. A viewer on Pages.** One static HTML file that polls `head` and renders the
projection. Free, zero dependencies, and it pairs with C, D or E without
changing any of them.

## The order to build it

1. The journal, as the stored form. Export, rollback and copy fall out of it.
2. The public projection and a spectator viewer, written to files.
3. B, the local server, when somebody wants to watch.
4. C, the quick tunnel, for the first shared link. Accept that it is temporary.
5. D, R2, when a link should outlive the session. This is where a free
   Cloudflare account enters the setup, and it should stay optional.
6. E only if live spectating at scale turns out to matter.

## Simulation

The core imports nothing from Pi, so the engine runs from a plain script. That
was the point of keeping the ports at the edge, and batch simulation is what
collects on it. `tools/sim.ts` plays games without a session, writes a journal
each, and prints the counters.

Inside one game everything stays serial: one decision outstanding, and provider
completion order never decides game order. Across games, parallel is free,
because two games share nothing but the card list and the rules, both of which
are read only.

What to count, separately, because one number hides all of them: decisions by
why they went that way, model calls, interpretation calls, gaps recorded, rules
failures, turns, the winner, and wall time. Measure the forced ratio against a
real decider and never a stub: a stub that answers everything the same way
makes the ratio look excellent while the real behaviour is nothing like it.

Finding the interesting games is a query across journals, which is the first
thing SQLite is actually for here. The index is derived and rebuildable, the
journals stay the source of truth, and nothing should ever read the index to
settle what happened in a game.

## Two things that are decided

**A spectator gets a spectator's odds.** Computed from public information only,
which is what every other seat could work out too. It leaks nothing because it
never reads a hand or a library. What a spectator does not get is any seat's
private view: hands, libraries and the cards a seat alone has seen stay with
that seat.

**Renaming a seat is an engine operation, not a game feature.** A fork may reuse
the original's names or take new ones, and the engine supports a rename so that
it can. Normal play never offers it: a name is set when the game starts and the
log would be unreadable if it changed halfway through. So the capability exists,
the command does not.
