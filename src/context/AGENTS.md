# The decision context engine

The core knows everything about the game. A decision model answers one narrow
question well, and badly when it is handed everything. Something has to decide
which slice of the core a given decision needs, carry the guidance that makes
one choice coherent with the whole turn, and handle the model asking for more.
That is this directory, and it is why it is not part of the game engine.

Read the root `AGENTS.md` and `skills/AGENTS.md` first. These are the additions.

## What this is not

Not the game. Nothing here writes to the table, advances a phase, or decides
legality. `src/core/loop.ts` is the only loop. If anything here starts stepping
the game forward, stop and move it.

Not the rules. Card meaning is compiled in `src/core/syntax.ts`, because a seat
played by a person needs it too. Not the judge, for the same reason.

Not required. A seat answered over p2p, by a person or through MCP loads none of
this. That is the test of whether something belongs here: if a human seat would
still want it, it belongs in the core.

## Three jobs, three calls

Collapsing these is how the earlier attempts played plausibly and weakly.

- **Plan** prepares the alternatives for a phase and what would reopen them. It
  reasons and annotates. It never picks.
- **Focus** builds the packet for one decision: the obligation, the resources,
  the options at equal detail, the ordered priorities, and the routes out.
- **Pick** returns one id from the prepared list. It never plans, never widens
  the list and never writes a move.

Asking one model to find the rules, work out the payment, invent a line and
choose it in one judgment is the failure this split exists to prevent.

## A question the decision model can answer well

Equal detail per option. A brilliant winning line beside waste resources
manufactures a preference without any analysis.

Facts apart from assumptions. A conditional outcome is shown as conditional,
because an opponent's unseen answer is not a known future event.

Every fact that changes what is legal, including the inconvenient ones. Small is
a retrieval discipline, not permission to drop a standing restriction.

An ordered priority, not a mood. Take an available win, otherwise prevent the
identified loss, otherwise keep the engine and the named response, otherwise
develop. Each option says which of those it serves.

## More is a route, not prose

A route is a predefined id with a predefined meaning, and it returns to the same
decision. It does not pass, refund a paid cost, change a locked choice, or
reveal anything the seat has not earned.

Widen mechanically first. The playable space is always larger than the
shortlist, and a shortlist of one is not proof that a choice was forced. Record
automatic execution as forced, delegated by an adopted plan, or equivalent, and
keep the three apart.

When a widened list still has nothing usable, record the gap and play on.

## Confidence is not correctness

Confidence describes the answer distribution. It is not the chance of winning
and it is not evidence that the option list was complete. Any threshold needs
calibrating against recorded games.

Count separately: plan calls, focus calls, model calls, forced steps, routes
followed, and rules failures. One number hides all of them.
