# pi-magic

A Pi package that owns a table of Magic.

The table has a game type, seats in turn order, and a deck and zones per seat.
It knows the rules, builds every legal move, and logs everything that happened.
It does not know who answers a seat.

Three directories, and the line between them is one question: would a person
sitting at that seat still want it?

- **`src/core/`** is the game. The syntax compiler, the state, the judge, the
  mana pool, stack order, the pregame, each seat's knowledge and intent, and the
  facts a seat works out from what it knows. A person wants all of it, so all of
  it is core.
- **`src/context/`** is the decision context engine. The core knows everything;
  a decision model answers one narrow question well and badly when handed
  everything. This picks the slice that matters for one decision and carries the
  guidance that keeps a choice coherent with the turn. It never writes to the
  table and never advances a phase.
- **`src/seating/`** carries a seat over a socket. Written, parked.

A seat is answered by a player: a decision model through `src/context/`, a
remote agent through `src/seating/`, a person at this Pi, or an MCP client. The
last three load nothing from `src/context/`.

Every kind of player is equally capable. It can take a listed move, move
specific cards itself, hand its turn to a model in English, ask for more
options, say one of eight fixed things, concede, or object and call the judge.
The context exists so a player sees the game and misses nothing. It does not
decide for them, and a player may choose to play badly.

## What the table enforces, and what it only offers

**Visibility is enforced.** A seat reads a view filtered to what it has earned,
and the filter keeps the shape of what it hides: six unknown cards arrive as six
unknown cards. No seat reaches past this, because a leak cannot be undone by a
later ruling.

**Conservation is enforced.** One zone per object, identity on a zone change,
nothing spent that does not exist. The table can check that a stated cost was
paid from resources that existed. It cannot know what the cost was.

**Rules legality is offered.** The move list is help, so a player need not know
the rules and misses nothing. It is not a cage: a seat may move cards itself and
the table records the motion and the claim and asks nobody whether a judge would
allow it. Another seat objects, and the judge settles it.

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

`src/context/roles.ts` holds the roles, the suggested patterns and the
resolution. `/magic models` reads the roster and says what each pattern
resolved to; `/magic models <role> <pattern> [seat]` changes one. The file
behind it is small JSON, so an edit needs no command at all.

A pattern that does not resolve is reported, never substituted. A game refuses
to start rather than discovering at its first decision that a seat has nobody
to answer it.

## Build order

Two seats of legal Standard first, and nothing widens until the games are good.
Then tournament deck lists, then up to eight seats, then Commander, then the
other formats. `src/core/format.ts` is why that costs little: seat counts,
starting life, hand size, singleton and the command zone are fields in a record.

Within Standard, from `design-ref/CIRCUITRY.md` section 12:

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
2. **Activated abilities**, by interrogation rather than generation, with oracle
   text from the card list as the source. Measured against the Cavern of Souls
   payment: one legal option, so no model call.
3. **Triggered abilities** and trigger ordering. `enters` is 48.5% of all
   triggers in Standard.
4. **Static abilities and the layer walk.** The hardest part. `docs/COMBAT.md`
   has the sublayers, taken from 613.4.
5. **Replacements**, including the ones on `enters`.

The engine's main job is bulk one on one games, so that interesting positions
can be frozen as benchmarks. `tools/sim.ts` is that run, and a fixture is a
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
checked against an enumeration before anything moves.

A decision with one legal option is not a decision. Take it, record it as
forced, ask nobody. That ratio is the difference between a game costing cents
and one costing dollars, and it decays every time a safeguard adds a question.

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

- **No leak.** A view names only cards in a public zone or the viewer's own
  hand, respects face-down identities, and keeps hidden counts. Receipt text
  uses event-time visibility, so a later reveal cannot expose an earlier action.
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
index.ts               the Pi extension: five commands, no game logic
src/core/              the game. Its own AGENTS.md holds the invariants
  table.ts, commit.ts  the shapes and their readers, and the one writer over them
  pregame.ts           the opening procedure and its choices
  turn.ts, steps.ts    turn obligations, step order, and phase boundaries
  priority.ts          actions offered to the current priority holder
  decisions.ts         the ordered dispatcher and application of listed picks
src/context/           questions for a decision model. Its own AGENTS.md
  roles.ts             which model answers which part, and where that is written
  model.ts             the one adapter onto Pi's classifier API
  seat.ts              a seat that picks from the list and nothing else
src/seating/           a seat over a socket. Parked
tools/cards.ts         build a card list from Scryfall, any format or all of it
tools/rules.ts         build a searchable Comprehensive Rules
tools/sim.ts           play games in bulk and print the counters
tools/smoke.ts         one live game against a real model. Opt in, costs money
cards/standard.tsv     5164 cards, committed, every field checked against source
rules/cr.tsv           4063 rules, headings and glossary terms, committed
docs/COMBAT.md         characteristics, the layer walk, combat, and the seams
docs/MULLIGAN.md       the opening: the rules, the three decisions, what a seat knows
docs/SEATING.md        the wire, for a reader with no code
docs/STATE.md          export, rollback, copying a game, and hosting options
docs/ZONES.md          the zones, identity, exile, dungeons, outside the game
design-ref/            the agreed design of the game. On disk, not in the repo,
                       not ours to publish. Read it before changing src/core/
```

`npm run cards` rebuilds the standard list and `npm run universe` writes all
32,870 cards with every column. `npm run rules` rebuilds the rules. All three
verify every carried field against the source and refuse to pass on a mismatch.
`/magic cards` and `/magic rules build` run them from inside Pi.

## Not built yet

- Model planning. `startingIntent` is explicit and minimal and stands in for
  `preparePhase`, so a seat plays with a plan nobody wrote. Packet assembly
  offers no widening routes until their handlers exist, and a model-backed seat
  can only pick from the list: it cannot declare, delegate or object.
- Every role but `decide`. The other four resolve, report and are not called.
- Card meaning. `src/core/syntax.ts` holds the five ability shapes, the correct
  layers, and the motions milestone one needs. The rest of the language is
  measured rather than guessed: 31 event kinds, 17 selector properties, 10
  operators, 8 amount forms.
- The derived facts. `summary`, `manaCurve`, the knowledge transitions, the odds
  and the replacement-hand spread are named with their invariants and unwritten.
- The judge, review rounds, and declaring. A game finishes without them.
- Export, rollback and copying. `journal.ts` fixes the stored form and `relive`
  replays a recorded ledger; the file functions around it are unwritten.
  `docs/STATE.md` holds the reasoning.
- Everything in `src/seating/`, by choice.
- Any format but Standard, and any seat count but two.
