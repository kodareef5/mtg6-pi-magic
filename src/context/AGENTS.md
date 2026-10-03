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

## Inference is Pi's

Pi holds the providers, the credentials and the model catalogue. `roles.ts`
names five parts and a Pi model pattern for each; `model.ts` is the one adapter
and holds no endpoint and no key. The classifier vocabulary is Pi's own, not a
copy of Pi's, because a second definition of the same shape drifts.

A pattern that does not resolve is reported. Do not fall back to another model,
including Pi's configured default: a game played by a model nobody chose is a
result that cannot be compared with another.

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

Use the projected window to select context. Mulligan questions need counts,
declarations and bottom obligations; turn questions need their phase and step.
Do not infer the phase from prose, and do not attach opening instructions to a
combat or upkeep question. A phase change alone is not a reason for a model call.

`focus(frame, intent)` assembles the current basic-land packet without a model
call. It copies offered ids, separates assumptions from projected facts, and
uses phase assumptions only when both turn and phase match. This scope check
does not prove an assumption still holds. Planning and validity checks remain
unwritten and accept filtered frames, never the full table.

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

Return unusable picks unchanged to the core loop. The loop owns retries and
fallback accounting for every kind of player. Never replace a bad pick with
the first option here: that loses the distinction between a choice and a fallback.

The loop puts the reason on the retried frame and `focus` carries it into the
packet, because a model handed the identical packet twice sends the identical
answer twice. Nothing else about the packet changes: the obligation, the options
and the priorities are the same question asked again.

A route is a predefined id with a predefined meaning, and it returns to the same
decision. It does not pass, refund a paid cost, change a locked choice, or
reveal anything the seat has not earned.

The current packet has no routes because widening and replanning are unwritten.
Do not advertise them. An explicit ask or delegation pauses at the same decision
with a recorded gap rather than repeatedly calling a player with unchanged options.

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
