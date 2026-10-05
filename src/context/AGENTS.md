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

Not the rules. The core owns the motion vocabulary and accepted card meaning.
There is no per-card compilation. Read `docs/SYNTAX.md` and `docs/PLANS.md`
for the current direction.

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

## Four thinking roles

The classifier executes. The thinking happens in the other four roles, and what
reaches a decision is a short plan plus the facts.

- **pregame** first assesses complete card meaning for every registered name
  with rules text. It saves accepted registrations and procedures before play;
  clones reuse them. Then four analysts run per seat (deck and resources,
  matchup, opening, a challenger), each able to look up rules and cards, then one
  synthesis that files the brief by where it is read. Both seats prepare at the
  same time. Strategy reads the whole brief; the pilot reads only the slice for
  its window, never the whole of it.
- **strategy** advances the pregame reasoning with one planner per seat. It
  prepares during the opponent's turn, then accepts or amends after the draw,
  and answers stops or requests for help. It submits changed fields and reuses
  its own accepted actions; context expands these into a complete plan for core.
  Optional notebook edits belong in that answer, not separate rounds. The cached
  system prompt carries the syntax semantics and the real schema; an example
  lookup supplies worked uses when needed. No challenger or timeout replacement
  plan runs beside it. A phase boundary spends no strategy call. docs/PLANS.md holds the
  lifecycle and its cancellation rules.
- **summary** runs beside the game, never awaited inside the loop, and is built
  from the spectator projection so it cannot hold a private fact.
- **judge** runs only on an objection, which the strategy writer raises beside
  its plan: one reasoner session with the rules to look up, a cited rule, and a
  remedy, stand or rollback, that the loop carries out.

Every call goes through `spend.ts` and carries an output ceiling. The ceiling is
a price and not a style, because some routes charge against the maximum asked
for rather than the reply returned.

## Preparation, projection, and selection

- **Plan** uses strategy to write the seat's plan: its line, branches, stops and
  holds. It proposes equipment edits, never physical actions.
- **Focus** builds the packet for one decision: the obligation, the part of the
  plan this window needs, the options at equal detail with the plan's marks, the
  public position, and the routes out.
- **Pick** returns one id from the prepared list. It never plans, never widens
  the list and never writes a move.

Before a pick, Jev reviews the current phase strategy, the next unfinished use,
and relevant cards through core's checklist. A use marked for action reaches a
move question before later steps are assessed. Asking to end requests the
remaining reviews and a separate confirmation. Judgments are private equipment,
not physical decisions. Resolution receives the already accepted effect and
its remaining instructions, rather than the next phase's casting guidance.

Asking one model to find the rules, work out the payment, invent a line and
choose it in one judgment is the failure this split exists to prevent.

## A question the decision model can answer well

Use the projected window to select context. Mulligan questions need counts,
declarations and bottom obligations; turn questions need their phase and step.
Do not infer the phase from prose, and do not attach opening instructions to a
combat or upkeep question. A phase change alone needs no strategy session;
Jev still answers each seat's priority windows.

`focus(frame, intent)` assembles a decision packet without a model
call. It copies offered ids, separates assumptions from projected facts, and
uses phase assumptions only when both turn and phase match. This scope check
does not prove an assumption still holds. Equipment readiness is checked
against the projected position; strategy also reads filtered frames, never the
full table.

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

The packet offers exact rule routes from disk, and `ask:help` when the seat has a planner.
Ordinary option widening, raw declarations, and free-form delegation remain unwritten. Do not
advertise an executable route whose handler does not exist.

Widen mechanically first. The playable space is always larger than the
shortlist, and a shortlist of one is not proof that a choice was forced. Record
compulsory rules operations as forced and explicitly authorized card
continuations as delegated. Voluntary actions and passes go to Jev.

When a widened list still has nothing usable, record the gap and play on.

## Confidence is not correctness

Confidence describes the answer distribution. It is not the chance of winning
and it is not evidence that the option list was complete. Any threshold needs
calibrating against recorded games.

Count strategy and classifier calls separately, alongside forced and delegated
steps, routes, gaps, tokens, cost and elapsed time. Focus makes no model call.

## The plan

`aiSeat` returns equipment commands to the core loop. It never writes the table.

The pilot's packet carries the plan's objective, the due step, the next two,
live branches, holds and stops, and what is done. It does not carry the deck
lists, card registrations, procedure bodies or the brief's matchup reading;
those are strategy's. Strategy receives the unfinished plan and reusable actions,
the visible objects with their current characteristics and accepted stack terms, the public registered
lists and their card text. Neither sees hidden arrangements or another seat's
equipment. Shape checking proves neither the rules nor the quality of the plan.
