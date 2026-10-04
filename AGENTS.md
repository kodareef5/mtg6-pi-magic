# pi-magic

A Pi package that owns a table of Magic.

The table has a game type, seats in turn order, and a deck and zones per seat.
It carries the rules, offers moves and physical operations, and logs what happened.
It does not know who answers a seat.

Three directories, and the line between them is one question: would a person
sitting at that seat still want it?

- **`src/core/`** is the game. The motion vocabulary, the state, the judge, the
  mana pool, stack order, the pregame, each seat's knowledge and intent, and the
  facts a seat works out from what it knows. A person wants all of it, so all of
  it is core.
- **`src/context/`** is the decision context engine. The core knows everything;
  a decision model answers one narrow question well and badly when handed
  everything. This picks the slice that matters for one decision and carries the
  guidance that keeps a choice coherent with the turn. It never writes to the
  table and never advances a phase.
- **`src/seating/`** defines the wire protocol and validates remote picks.
  Socket hosting, joining and the pending-player adapter are unfinished.

The current player adapter uses a decision model through `src/context/`.
Future remote, human and MCP adapters use the same core interface without
loading decision-model context.

The player interface is intended to offer the same capabilities to every seat.
Listed picks, table talk and prepared procedures work today. Raw declarations,
free-form delegation, concession handling and objections still need handlers.
Context supplies decision facts and guidance; the player chooses.

## What the table enforces, and what it only offers

**Visibility is enforced.** A seat reads a view filtered to what it has earned,
and the filter keeps the shape of what it hides: six unknown cards arrive as six
unknown cards. No seat reaches past this, because a leak cannot be undone by a
later ruling.

**Conservation is enforced.** One zone per object, identity on a zone change,
nothing spent that does not exist. The table can check that a stated cost was
paid from resources that existed. It cannot know what the cost was.

**Rules legality is offered.** The move list is help, so a player need not know
the rules and misses nothing. Prepared procedures record the motion and the accepted claim without certifying
that a card permits it. Raw declarations and objections with remedies remain
part of the intended interface, not working alternatives yet.

**Nothing is done for a player.** Untap, the draw step and state-based actions
are the rules and happen. A card's instruction belongs to the seat resolving it:
a seat that forgets to draw did not draw. A seat may hand such steps over in its
intent, recorded as `delegated`, never as `forced`.

## Which model answers which part

Inference is Pi's. Pi holds the providers, the credentials and the model
catalogue, which is most of why this is a Pi package and not a program with a
config file. A role is a Pi model pattern and nothing more: the string a person
types at `/model`, an id with an optional thinking level after a colon. No
endpoint, no key and no provider name is written in this repo.

Five roles, because they want different models. `decide` is a classifier and
answers with one of the ids the table listed, which is why a model cannot invent
a move here even in principle. `pregame`, `strategy`, `judge` and `summary` are
chat models. A roster belongs to a seat, so two seats with different rosters is
one model playing another, and the ledger says who chose what.

The classifier executes and does not strategise. So the thinking happens in the
other four roles and what reaches a decision is a short plan plus the facts.
Handing the classifier everything known about the game is the failure the split
exists to prevent: it is smart, and it is not going to work out a line.

`src/context/roles.ts` holds the roles, the suggested patterns, the resolution
and why each default is what it is. `/magic models` reads the roster and says
what each pattern resolved to, `/magic models why` says what each default was
chosen for, and `/magic models <role> <pattern> [seat]` changes one. The file
behind it is small JSON, so an edit needs no command at all. A pattern of `off`
switches a role off, which is a decision and not a gap.

A pattern that does not resolve is reported, never substituted, including when
Pi has a configured default: a game played by a model nobody chose is a result
that cannot be compared with another. A seat with no `decide` model refuses to
start. A seat with no `pregame` model plays with no brief, because a missing
plan costs some quality and a refused game costs everything.

### What each call is for

**`pregame` runs once, as one concurrent wave per seat.** Not one question. A
single "tell me your strategy" call produces a paragraph that then gets pasted
into every decision, and a decision about blocking does not want the mulligan
reasoning. So the unit of the pass is the unit of injection: every answer is a
snippet filed under where it will be read. The deck's strengths, the pairs meant
to combine, the opening with its named edge cases, one per phase with a decision
window, and one per card that earns a note. Card notes are keyed by name and
cost nothing on a turn where the card never appears, which is why they are per
card rather than per group. A card earns a note mechanically before a call is
spent, so a basic land gets none.

Registered deck lists are public. Every seat and spectator receives names and
counts, never the assignment of those names to hidden objects or library order.
Standard already sets `format.decksRegistered`; pregame and decision context
use that setting. Future odds must use these counts and the viewer's earned
knowledge, never the real hidden position. Closed-list games can be a v2 option;
do not build a settings interface or odds engine in this cleanup.

**`summary` runs once per turn that had something in it, beside the game.** Two
sentences from the spectator projection, so it can hold nothing private by
construction. It is what lets a later decision know what has been going on
without carrying the log. It is never awaited inside the loop: measured on a
game of basic lands, 107 recaps at a second or two each turn 24 seconds of play
into minutes of it, so the call is started at the turn boundary and the answer
lands when it lands.

**`strategy` runs once per turn of its own seat, and on an escalation.** A seat
that opts in with `plan.each-turn` is asked for its plan after it draws, before
any automatic pass, and that plan covers the opponent's next turn too. Between
sessions jev does the work; when the plan stops fitting, jev escalates and that
is a request. A phase change alone spends nothing.
`worthPlanning` retains the old mechanical estimate for comparison, but does
not initiate calls. `/magic play <seed> circuits` opts into this path.

**`judge` runs only on an objection,** in two calls. The decision model scores
candidate rules for relevance, then the reasoner rules on the few that survive
and names the remedy. It stops at the verdict, because carrying a remedy out
needs rollback and that is unwritten.

### Cloning a game

A clone is the same game continued. That one sentence is what keeps the
machinery small: copying a prefix copies everything up to that point, so nothing
has to be matched up afterwards and there is no question of whether some part of
the parent belongs to the child.

The brief is a journal line rather than a cache beside the journal, so it comes
across like anything else. Two points are worth knowing about.

**Version zero** is a table that has been set up and asked nothing, whose seats
already hold what a model prepared for them. Clone there to vary the play
without paying for a pregame again.

**Any later version** is a position. Clone there to try a different line from it.

Three commands, kept apart, because conflating two of them was a real bug.
`/magic play [seed]` is a new game. `/magic clone <game> <version> <id>` copies
a prefix. `/magic resume <id>` replays a journal and plays on from where it
stops. A command that claimed to play a clone and instead started a fresh game
carrying another game's briefs was neither of those things.

### What a game costs

Measured on one game of basic lands, 108 turns, with the suggested defaults:

```
decide    109 calls   one per asked decision, 95.4% of decisions are forced
pregame     9 calls   2,743 input tokens     $0.042 at gpt-6.1-sol:low
summary   107 calls  67,187 input tokens     $0.040 at gpt-5.6-luna:low
```

Every call is recorded in `src/context/spend.ts` with its model, thinking level,
wall time, tokens in and out, reasoning and cached tokens where the provider
reports them, and the cost at the catalog price. The decision model is in the
same bill, counted when a request is made rather than when one comes back, so a
run that was rate limited does not report as free. The output ceiling is there too
and not in the prompts, because it is a price rather than a style: some routes
price a request against the maximum output asked for rather than the output
returned, so every role names a deliberate ceiling and a reply that hits it is
recorded as truncated.

## Build order

Two selected real Standard lists first. `decks/standard-matchup.json` pins the
lists, legality date, card data and rules; `docs/STANDARD.md` inventories their
mechanics. Completion
means ordinary deck setup, supported relevant actions and interactions, outcomes
without missing-machinery gaps, and replay and clone parity. An established
board fixture or passing over unsupported cards does not meet that target.
Deck-list validation and gameplay legality audits are separate checks.

After those games work, widen the deck coverage, then seat counts, Commander,
and other formats. `src/core/format.ts` is why that costs little: seat counts,
starting life, hand size, singleton and the command zone are fields in a record.

Within Standard, from `design-ref/archive/CIRCUITRY.md` section 12:

1. **A game with no cards.** Pass, play a land, untap, draw, mulligan, deck out.
   **Implemented for basic-land fixtures:** two seats finish by deck out.
   Decision discovery is pure, simultaneous losses settle together, and cleanup
   keeps asking until the hand fits. Opening choices, turn obligations and
   priority actions have separate handlers. Views identify the current window;
   table talk is offered at actual phase endings. Control transitions move the
   cursor without writing an event, because a replay derives them; opening
   completion is derived from its obligations. **Running against a real decision
   model:** `/magic play` finishes a game through Pi's classifier API. Measured
   live at 108 turns, 2357 decisions, 95.4% forced, 109 model calls, 0 gaps.
   The bulk runner is still unwritten.
2. **Spells and activated abilities through prepared procedures.** The first experiment
   binds visible sources, pays tap and unrestricted mana costs, resolves two
   draw/discard abilities in stack order, and clones during a pending discard.
   Accepted claims and instructions are journaled. Every legal card is
   assumed supported; `cards/unsupported.txt` lists the ones that are not, and
   a deck containing one is refused. Cards are not compiled: a seat uses a card
   through the syntax in `docs/SYNTAX.md`, as procedures it announces and
   packages its permanents register as they enter. The table offers any land
   and casts a non-Aura permanent spell for its printed cost with no card text,
   paying by tapping lands and registered mana abilities during casting
   (601.2g). A seat that plans each turn plans once per turn of its own, after
   drawing, before any automatic pass. `npm run matchup` plays the pinned lists
   live and stops at the first gap.
3. **Triggered abilities** and trigger ordering. `enters` is 48.5% of all
   triggers in Standard.
4. **Static abilities and the layer walk.** The hardest part. `docs/COMBAT.md`
   has the sublayers, taken from 613.4.
5. **Replacements**, including the ones on `enters`.

The engine's main job is bulk one on one games, so that interesting positions
can be frozen as benchmarks. `tools/sim.ts` is still a stub. A fixture is a
journal prefix rather than a format of its own. Two consequences: the core
imports nothing from Pi and that has to stay true, and the ledger's five reasons
never merge into one count.

## Build style

Fewer lines. Budget the time for taking code out, not putting it in.

No layer whose only job is to call the next layer. A port is for something
outside this process: a model, a decision api, a socket, the clock, the random
source. Do not write a port for a function.

Features as buckets. One kind with a parameter beats twenty kinds: 67 trigger
clauses across sixteen named keyword actions are one event with the name as a
parameter, and a kind per action would mean a code change every three months. A
bucket holding one card is fine; a third mechanism for the second awkward card
is not. When a card will not fit, carve it out, record the gap, leave the bucket.

No derived value is ever stored. A creature's power is read through the layers
every time it is asked for. If a change would be easier by caching one, the walk
is in the wrong place.

The table never reads printed card text. Meaning arrives as structured terms,
checked against an enumeration before anything moves. Printed type line, mana
cost and power/toughness are structured fields, not text, so the table reads
those from the pinned card file rather than trusting a claim.

A decision with one legal option is not a decision. Take it, record it as
forced, ask nobody. This saves calls on physical decisions. Circuit navigation
and review can spend calls without adding a physical decision, so the forced
ratio must be read beside total calls, tokens, cost, and elapsed time. A unique
continuation authorized by the seat's plan is delegated, not forced.

Never decide for a seat by accident. An unusable answer is asked once more, then
the table takes the terminating option, records `fallback`, and writes a gap. A
fallback is not a choice. Do not complete an invalid selection from what is
left, do not treat a failed operation as a decision, and do not add a cap that
reads as though the seat chose to stop.

When the rules cannot settle something, record the gap and play on.

Write the control flow for real and leave the leaves unwritten. Keep a file
under about 150 lines, and past that say in the file why.

## Tests state invariants

Keep one test per invariant in `test/`. Extend that test with new positions
rather than adding a test for each branch.

- **No leak.** Registered deck names and counts are public. A view associates
  names with objects only in public zones or the viewer's own hand, respects
  face-down identities, and keeps hidden counts. Receipt text uses event-time
  visibility, so a later reveal cannot expose an earlier action.
- **Replay.** The same seed and the same recorded decisions give the same log,
  change for change, and rebuild the cards, the cursor, the ledger and the
  outcome. `relive` drives from the ledger with each row's own reason, so a
  fallback replays as a fallback. The log holds events only; a control
  transition is derived rather than stored. A frame's version is the table's
  revision, so anything that commits moves it.
- **Forced.** Far more decisions are taken by the table than asked of a seat,
  and no row is a `fallback`.
- **Idempotent.** The same `actionId` applied twice changes the game once.
- **Pure.** Listing a decision changes no state, including pending losses.
- **Simultaneous.** The outcome accounts for every loss in a committed group.
- **Complete.** Cleanup stays pending until every required discard is made.
- **Accounted.** Unusable answers retry once, and the retry says why the last
  one was refused, all the way through to the packet a model reads. A
  terminating keep or pass is recorded as fallback; a mandatory card selection
  stays pending without moving a card. Resuming uses the same table and
  decision.
- **Scoped.** Listed moves belong to the current opening or turn window;
  advancing cannot skip an unanswered decision. Table talk is offered once per
  seat at a phase ending, not at every step or bookkeeping transition.
- **Focused.** A context packet preserves the seat's projected facts and option
  ids. Phase assumptions apply only to their recorded turn and phase.
- **Answered.** A roster resolves a pattern the way a reader would type it and
  refuses an ambiguous one. A model-backed seat finishes a game, is asked only
  what is not forced, reads a refusal in its next request, and never has a wrong
  answer kind turned into a pick.
- **Briefed.** The pregame asks several questions at once, files each answer
  where it is read, and uses public registered lists without hidden arrangements.
  A snippet reaches the decision for its own window, a card note only while its card is visible,
  and a failed question is a gap the game plays on without.
- **Beside.** The turn hook is never awaited, so a hook whose promise never
  settles cannot stop a game and one that throws becomes a gap. Recaps land in
  turn order however late they arrive. Every call is in the bill with its model,
  ceiling and tokens, every attempt of a retry included.
- **Noticed.** A transient failure is retried and a settled one is not. A
  reasoner that has given up is asked nothing more, so one wrong model is one
  problem and not one per turn. A seat with no brief at all throws rather than
  playing, and `degraded` names why a finished game is not a comparable one.
- **Cloneable.** A journal round trips, drops a torn last line and refuses a
  torn middle one. A clone at version zero carries the briefs and no decisions;
  a clone at version n replays to that position and plays on with a prefix
  identical to its parent. A replay against different card text is refused. A
  game rebuilt from its own header deals the cards the original dealt.
- **Ordered.** The stack is one order for the table and a library is one per
  seat, so objects cast by different seats interleave in cast order and the
  whole zone renumbers when one resolves.
- **Saved.** The file holds the game the table holds, line for line, through a
  whole lifecycle: played, cloned, torn off mid write, resumed, played on and
  cloned again. A clone owns its preparation, so this run's roster cannot
  discard it. A resume repairs a torn last line before it appends, because a
  fragment dropped on a read and kept on disk is a lost journal one write later.
- **Alone.** A finished game reports and returns with nothing else keeping the
  process alive. Stated in a child process, since a test runner keeps the event
  loop awake and hides it.
- **Dialled.** Following a route changes what a seat knows and nothing else:
  the table is byte for byte unchanged, the obligation and the moves offered are
  the same, and the rule arrives labelled as something the seat asked for. Every
  route cites rules that resolve and carries their text. A route id reads as an
  ask, never as a move, and says what it does not show. A walked route is not
  offered again and the budget ends the walk.
- **Equipped.** Private drafts and agenda edits have their own revision and
  journal history. A tool batch either applies whole or changes nothing. A
  review accounts for every scoped object, concept and label, and changed facts
  reopen it without turning passes into fresh questions. Scheduled attention
  is consulted before an automatic pass. Readiness moves no cards; execution
  advances one draft step through the ordinary writer. A changed position,
  missing reservation or stale incarnation requires inspection. A clone carries
  unfinished work, and a torn equipment write cannot repeat an executed step.

`npm test` runs them, `npm run check` runs the types. Both pass on every commit
or the commit is not done. Neither makes a network call: the decision model is a
double whose shape is Pi's own `classify`. `npm run smoke` is the live run, opt
in, and it reports the seed, the outcome, the model calls, the forced ratio and
the gaps. Tests live beside the code and ship with neither:
`package.json#files` leaves them out of the package.

## Writing rules

Every word a human or a model reads goes through the unslop rules: this file,
`docs/`, the skills, tool descriptions, command output, and every prompt. The
source is `skills/unslop/SKILL.md` in `backnotprop/pstack`. The ones that bite
here: no em dashes, sentence case headings, straight quotes, name the actor, say
what it does rather than how it feels, and cut any sentence that could appear
unchanged in another project's docs.

They are a reminder that this is not a research dump. Break one when breaking it
is clearer. Slop is the thing being kept out.

A prompt is held to the same standard and to one more: it must name what the
call does not promise. Read `skills/AGENTS.md` before writing text a model reads.

## Where things live

```
index.ts               the Pi extension: commands and tools, no game logic
src/core/              the game. Its own AGENTS.md holds the invariants
  table.ts, commit.ts  the shapes and their readers, and the one writer over them
  work.ts, agenda.ts  private equipment and scheduled consideration
  draft.ts           prepared sequences, bindings, reserves and readiness
  language.ts        the syntax a seat writes: procedures, registrations, plans
  work-language.ts   the checked JSON tool vocabulary, not model-written code
  work-tools.ts      atomic equipment edits, separate from physical motion
  work-menu.ts       the draft and agenda menus any player can use
  printed.ts         type line, mana cost and power/toughness from the card file
  entry.ts           what a permanent registers as it enters, frozen on the ledger row
  funding.ts         paying a cost: floating mana and mana abilities while paying
  procedures.ts      one offer path for drafts and default casts, activation terms
  resolution.ts      remaining instructions and choices before a checkpoint
  pregame.ts           the opening procedure and its choices
  turn.ts, steps.ts    turn obligations, step order, and phase boundaries
  priority.ts          actions offered to the current priority holder
  decisions.ts         the ordered dispatcher and application of listed picks
src/context/           questions for a decision model. Its own AGENTS.md
  roles.ts             which model answers which part, and why each default
  model.ts, reason.ts  the two adapters onto Pi: classifier, and chat
  spend.ts             what every call cost, and the output ceiling per role
  brief.ts             the pregame wave, and the snippets it files by use
  summary.ts           the turn in two sentences, from the spectator view
  strategy.ts          a turn's plan, and reconsideration on an escalation
  ruling.ts            the judge's two calls. Pipeline written, stops at verdict
  dial.ts              the routes a seat can ask for, answered from the rules
  packet.ts, seat.ts   one decision's context, and the seat that answers it
  sit.ts               seating a whole table, so one command cannot differ
src/seating/           protocol and validation; sockets unfinished
tools/cards.ts         build a card list from Scryfall, any format or all of it
tools/rules.ts         build a searchable Comprehensive Rules
tools/sim.ts           stub for bulk games and counters
tools/smoke.ts         one live game against a real model. Opt in, costs money
tools/circuits.ts      offline circuit experiments and a local timeline inspector
tools/matchup.ts       the pinned Standard matchup, live through Pi, unscripted
cards/unsupported.txt  legal cards the engine cannot play; a deck with one is refused
docs/SYNTAX.md         the syntax, the table's line, and execution semantics
docs/examples/         worked uses of the syntax by shape, checked against card text
decks/standard-matchup.json  source lists, legality date, card and rules hashes
docs/STANDARD.md       first real opening, observed failures and mechanics inventory
cards/standard.tsv     5164 cards, committed, every field checked against source
rules/cr.tsv           4063 rules, headings and glossary terms, committed
docs/CIRCUITS.md       the toolbox, the circuits built from it, and how a seat
                       decides. Read it before planning anything past milestone one
docs/WORK.md           the working draft, agenda, review and tool contract
docs/COMBAT.md         characteristics, the layer walk, combat, and the seams
docs/MULLIGAN.md       the opening: the rules, the three decisions, what a seat knows
docs/SEATING.md        the wire, for a reader with no code
docs/STATE.md          export, rollback, copying a game, and hosting options
docs/ZONES.md          the zones, identity, exile, dungeons, outside the game
design-ref/            observations about Magic, on disk and not ours to publish.
                       Its own README says what moved to archive/ and why: the
                       documents that decided a design have been superseded by
                       docs/CIRCUITS.md, and the ones that measured the game stand
```

`npm run cards` rebuilds the standard list and `npm run universe` writes all
32,870 cards with every column. `npm run rules` rebuilds the rules. All three
verify every carried field against the source and refuse to pass on a mismatch.
`/magic cards` and `/magic rules build` run them from inside Pi.

## Not built yet

- Strategic quality. `strategy.planWork` prepares checked equipment on request,
  and offline experiments exercise its choreography through authored doubles.
  Live Pi probes exercise preparation and execution, but do not measure playing
  strength. Prepared procedures support a small set of physical instructions;
  both authored and live probes remain separate from full-deck evaluation.
- The judge's remedy. `ruling.rule` holds the two-call pipeline and stops at the
  verdict, because rollback is unwritten and a ruling with no remedy changes no
  game. A ruling also makes the phase plan stale, which is a consequence of one
  rather than a step in it.
- Widening routes. `more-options`, `better-targets` and `replan` need machinery
  that does not exist, so nothing advertises them. The rules routes in
  `src/context/dial.ts` are the ones that work, because the rules are on disk
  and answering one costs no model call.
- General declaring, delegating and objecting. A model-backed seat can execute
  prepared procedures and delegate unique continuations for its own seat. Raw
  `declare`, free-form delegation, and `judge.rule` still throw or leave the
  decision pending. Conservation and the judge must carry the weight that a
  fully informed move list would.
- The rest of card meaning. Prepared procedures can cast a card from hand,
  announce one creature or player target, and deal literal damage. Creature
  checks read printed power and toughness, not a completed layer walk. Wider
  targets, combat, triggers, replacements, restricted mana and complex costs
  remain unwritten. Most cards in the pinned lists need machinery that does
  not exist yet; `npm run matchup` stops at the first one it meets.
- The derived facts. `summary`, `manaCurve`, the knowledge transitions, the odds
  and the replacement-hand spread are named with their invariants and unwritten.
- The judge, review rounds, and declaring. A game finishes without them.
- Rollback. `journal.ts` holds the file, the replay, the clone and the export;
  `rollback` is the one left, because it needs every remaining seat to agree and
  nothing holds that conversation. `docs/STATE.md` holds the reasoning.
- More resolution choices. The table now holds the remaining instruction and
  count while a choice is pending, and distinguishes continuation from a
  state-based checkpoint. Multiple or restricted targets, bindings between instructions and
  simultaneous multi-card choices still need machinery.
- Provenance beyond the accepted claim. The journal now carries each executed
  procedure's basis, instructions, payment and delegation. Replay uses those
  accepted terms. Model and interpreter version attribution still needs work.
- Controlled model comparison. `npm run smoke -- --trace` saves exact requests,
  replies and errors, including the recaps each call received. The trace is
  private seat data. The forced ratio is evidence about cost, not decision
  quality; a comparison harness and version attribution remain unfinished.
- Socket hosting and joining. The protocol and pick validation exist in
  `src/seating/`; its sockets and pending-player adapter are unfinished.
- Any format but Standard, and any seat count but two.
