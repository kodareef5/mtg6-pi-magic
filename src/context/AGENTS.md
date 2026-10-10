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
The next-version contract replaces mandatory whole-card compilation with shared
mechanics and scoped readiness. Read `docs/SYNTAX.md` and `docs/PLANS.md`
for the current direction.

Not required. A seat answered over p2p, by a person or through MCP loads none of
this. That is the test of whether something belongs here: if a human seat would
still want it, it belongs in the core.

## Inference is Pi's

Pi holds the providers, the credentials and the model catalogue. `roles.ts`
names five parts and a Pi model pattern for each; `model.ts` (the classifier)
and `reason.ts` (chat) are the two adapters, and neither holds an endpoint or a
key. The classifier vocabulary is Pi's own, not a
copy of Pi's, because a second definition of the same shape drifts.

A pattern that does not resolve is reported. Do not fall back to another model,
including Pi's configured default: a game played by a model nobody chose is a
result that cannot be compared with another.

## Four thinking roles

The classifier executes. The thinking happens in the other four roles, and what
reaches a decision is a short plan plus the facts.

- **pregame** prepares understanding and a reusable strategic playbook. It
  prepares standing terms and identifies every cast and activation. Particular
  uses can remain deferred until a visible source enters their accepted scope.
  The strategy model then interprets them in a separate call before priority
  continues. With strategy off, pregame prepares complete uses. Source coverage does not certify
  interpretation. Policies cover opening, sequencing, resources, responses,
  combat and recovery, with priorities, worked examples and reversing conditions.
  The implementation still uses four analysts and a synthesis; measure its wall
  time and repairs before claiming that a larger brief improves gameplay.
- **strategy** advances the pregame reasoning with one plan per seat per turn.
  By default an analyst wave (survey, branches, growth) reads the dossier and
  one coordinator writes the plan; `--no-survey` runs the coordinator alone. It
  prepares during the opponent's turn, accepts scoped work before upkeep choices,
  then reviews the unfinished line after draw. Without prior scoped work, opening
  planning waits for draw. It also answers stops or requests for help. It submits changed fields and reuses
  its own accepted actions; context expands these into a complete plan for core.
  Optional notebook edits belong in that answer, not separate rounds. The cached
  system prompt defines ordinary plans and conditions. Visible cards supply their
  full text and accepted actions; equipment, syntax and example lookups supply
  wider card terms when needed. No challenger or timeout replacement
  plan runs beside it. A phase boundary spends no strategy call. docs/PLANS.md holds the
  lifecycle and its cancellation rules.
- **summary** runs beside the game, never awaited inside the loop, and is built
  from the spectator projection so it cannot hold a private fact.
- **judge** runs only on an objection, raised by the strategy writer beside
  its plan or by the pilot for a just-recorded opposing block: one reasoner session with the rules to look up, a cited rule, and a
  remedy, stand or rollback, that the loop carries out.

Every call goes through `spend.ts` and carries an output ceiling. The ceiling is
a price and not a style, because some routes charge against the maximum asked
for rather than the reply returned. It is a requested limit; a route may ignore
it. The ledger records truncation only when the provider reports a length stop.

## Preparation, projection, and selection

- **Plan** uses strategy to write the seat's plan: its line, branches, stops and
  holds. It proposes equipment edits, never physical actions.
- **Focus** builds the packet for one decision: the obligation, the part of the
  plan this window needs, the options at equal detail with the plan's marks, the
  public position, and the routes out.
- **Pick** returns one id from the prepared list. It never plans, never widens
  the list and never writes a move.

The action question opens with a short orientation. Every criterion follows one
template: what the option does, its facts, and the plan's marks on it, including
marks shared by all variants of a use. The checklist states in plain words
whether an option here takes each planned action. The pass option says what
passing does now; nothing in the question grants or withholds a pass. A phase
that asks for help is stated on the help option. Jev does not
receive a separate response review or one strategic question per unmentioned
card. Resolution receives the accepted effect and its remaining instructions,
with the purpose recorded when the seat announced it.

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

Build context for the question before rendering it. Do not fit a request by
clipping strings, cutting card paragraphs, taking the first N options or dropping
required facts. A large request needs an explanation of its contents and a
complete way to inspect the decision in smaller questions. Preserve original
move ids, visible restrictions and access to every choice. Inspection moves
nothing. When the classifier refuses a request as longer than its window, the
seat asks the same decision again with half as many options per question, so
inspection splits it into ranges; nothing is cut. Record capacity failures as
infrastructure failures, never as a seat's wish to pass. `docs/PLANS.md` records the current contract. Historical builders and examples
belong in the ignored `design-ref/` archive.

Design from preferred uses before editing those builders or planner prompts.
Write representative simple and complex question sequences, including changed
positions, then review every phase, seat and planning stage against them. Those
examples define what pregame and strategy must prepare for Jev. Existing packets
and failed games are later regression evidence, not the shape to trim into a
specification. `docs/PLANS.md` names the representative uses and links the earlier worked set.

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

Strategy owns trigger order. A plan's `triggers` lists the sources of the seat's
triggers in resolution order, with named targets; the table marks the put that
goes on now, in placement order, and the pilot is asked nothing more. When two or
more triggers wait and no plan order covers them, the pilot is asked which of
each pair resolves first. Each answer states both directions ("A resolves before
B, so B goes on the stack first"), the questions go out together and are asked
again at each put, and contradictory answers state no order. The answers move
nothing. Each put is still its own decision and its own ledger row, which the
opponent can object to; the put question gives any order as placement order,
the trigger that goes on now first, and every option stays offered. Measured
alternatives did worse: one list question ("which resolves first?") drew the
first-listed trigger, and a resolution order given at the put drew the
first-named trigger onto the stack, which inverts the plan.
Ordinary option widening, raw declarations, and free-form delegation remain unwritten. Do not
advertise an executable route whose handler does not exist.

Widen mechanically first. The playable space is always larger than the
shortlist, and a shortlist of one is not proof that a choice was forced. Record
compulsory rules operations as forced and explicitly authorized card
continuations as delegated. Voluntary actions and passes go to Jev.
Core reads that permission from `Intent.deck.delegates`. The model adapter does
not grant it or offer a delegation tool.

When a widened list still has nothing usable, record the gap and play on.

## Confidence is not correctness

Confidence describes the answer distribution. It is not the chance of winning
and it is not evidence that the option list was complete. Any threshold needs
calibrating against recorded games.

Count strategy and classifier calls separately, alongside forced and delegated
steps, routes, gaps, tokens, cost and elapsed time. Focus makes no model call.

## The plan

`aiSeat` returns equipment commands to the core loop. It never writes the table.

The pilot's packet carries the due step, waiting steps, their execution choices,
live branches, holds and stops, and what is done. General objective and guidance
are audit rationale. Tactical policies expire with the plan. It does not carry the deck
lists, card registrations, procedure bodies or the brief's matchup reading;
those are strategy's. Strategy receives the unfinished plan and reusable actions,
the visible objects with their current characteristics, accepted stack terms and
card text. Public registered lists remain available, with lookups for absent cards.
Neither sees hidden arrangements or another seat's
equipment. Shape checking proves neither the rules nor the quality of the plan.
