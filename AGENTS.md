# pi-magic

A Pi package that owns a table of Magic.

The approved next-version contract and commit checklist are in `docs/PLANS.md`.
Complete executable card programs are no longer a setup requirement to preserve.
Standing terms and a source-backed inventory precede dealing. Deferred casts
and activations become required seat work when a visible source enters their
accepted scope, before a priority action or pass can hide missing meaning.
Keep Jev as the interface pilot. Many calls are acceptable; extra deliberation
and strategic work without a prepared policy are the problems to remove.

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
- **`src/seating/`** is who pilots a seat: the lobby and its two agreements,
  the host's hold on a running game, and a person over a seat's AI.

Every seat's player is a decision model through `src/context/`, in the host's
Pi. A person piloting a seat sits over it (`src/seating/person.ts`) and loads
none of `src/context/`; an MCP adapter will do the same.

The player interface is intended to offer the same capabilities to every seat.
Listed picks, table talk, prepared procedures, objections and conceding when
asked work today. Raw declarations and free-form delegation still need
handlers.
Context supplies decision facts and guidance; the player chooses.

## What the table enforces, and what it only offers

**Visibility is enforced.** A seat reads a view filtered to what it has earned,
and the filter keeps the shape of what it hides: six unknown cards arrive as six
unknown cards. No seat reaches past this, because a leak cannot be undone by a
later ruling.

**Conservation is enforced.** One zone per object, identity on a zone change,
nothing spent that does not exist. The table can check that a stated cost was
paid from resources that existed. It cannot know what the cost was.

**Decks are registered.** A deck is a name, a source, and a main deck and
sideboard as counts of card names; a name identifies one card in the card
universe. Setup registers each seat's deck for its game: every card must exist
in the universe, be legal in the format, and be supported, and the counts must
follow the format (100.2a, 100.4a). A deck that does not register stops the
game before it begins. Every card in a game comes from a registered deck: the
main deck becomes the library and the sideboard waits outside the game.
`decks/collection/` keeps tournament lists and practice decks for tests and
play; tests build their positions from those decks, never from invented lists.

**Rules legality is offered.** The move list is help, so a player need not know
the rules and misses nothing. Prepared procedures record the motion and the accepted claim without certifying
that a card permits it. A seat that thinks another broke a rule objects, and
the judge rules. Raw declarations remain part of the intended interface, not a
working alternative yet.

**Nothing is done for a player.** Untap, the draw step and state-based actions
are the rules and happen. A card's instruction belongs to the seat resolving it:
a seat that forgets to draw did not draw. A seat may hand such steps over in its
intent, recorded as `delegated`, never as `forced`.

## Which model answers which part

Inference is Pi's. Pi holds the providers, the credentials and the model
catalogue, which is most of why this is a Pi package and not a program with a
config file. A role is a Pi model pattern and nothing more: the string a person
types at `/model`, an id with an optional thinking level after a colon. No
endpoint or credential is written in this repo.

Five roles, because they want different models. `decide` is a classifier and
answers with one of the ids the table listed, which is why a model cannot invent
a move here even in principle. `pregame`, `strategy`, `judge` and `summary` are
chat models. A roster belongs to a seat, so two seats with different rosters is
one model playing another, and the ledger says who chose what.

The classifier executes and does not strategise. So the thinking happens in the
other four roles and what reaches a decision is a short plan plus the facts.
Handing the classifier everything known about the game is the failure the split
exists to prevent: it is smart, and it is not going to work out a line.

The roster is Jev for `decide`, `gpt-6.1-sol:high` for `pregame`, and
`anthropic/claude-haiku-5.5:medium` for `strategy` and `judge`, with `summary`
off in testing. Haiku replaced Luna low on October 10, when the growth fixtures
showed thinking effort, not prompting, was what found lethal lines. Keep that
roster while improving gameplay; a different model or effort is a different
experiment, and changes only when explicitly asked.

An explicit `claude-cli/claude-haiku-5-5:medium` pattern selects the installed
Claude CLI through a Pi provider; the CLI owns authentication. `--claude` on
the matchup and simulation tools selects it for strategy and judge. Jev still
uses its selected classifier provider. See `docs/INFERENCE.md`.

`src/context/roles.ts` holds the roles, the suggested patterns, the resolution
and why each default is what it is. `/magic models` reads the roster and says
what each pattern resolved to, `/magic models why` says what each default was
chosen for, and `/magic models <role> <pattern> [seat]` changes one. The file
behind it is small JSON, so an edit needs no command at all. A pattern of `off`
switches a role off, which is a decision and not a gap.

A pattern that does not resolve is reported, never substituted, including when
Pi has a configured default: a game played by a model nobody chose is a result
that cannot be compared with another. A seat with no `decide` model refuses to
start. A seat with no `pregame` model can reuse carried card assessments and
play without a brief. Missing standing terms or an incomplete use inventory
stop setup. A carried deferred use needs the strategy role as its runtime
interpreter; a new game with that role off prepares complete uses in pregame.

### What each call is for

**`pregame` prepares card understanding and the strategic playbook.** Card
understanding does not require a complete executable program for every mode of
every registered card. Models supply source-backed standing terms before an
affected event and particular uses when needed. Core executes shared mechanics
and never interprets Oracle prose. Accepted terms remain journaled and reusable.
`assess.ts` prepares standing registrations and identifies every cast and
activation. `printedCast` selects the shared ordinary permanent cast; other
uses can be deferred. `interpret.ts` uses the selected strategy model in a
separate call to prepare an identified use, preserving standing terms. The
call is billed as strategy with purpose `interpret <card>`. Core records the
answer as equipment before asking for a physical choice. Source visibility and
zone permission trigger readiness, even if payment or targets are unavailable.
Syntax and source checks do not certify the model's interpretation.

Four analysts work at once on separate questions (deck and resources, the matchup,
the opening, a challenger looking for traps), with both registered lists, exact
opening-hand odds computed in code, and tools to look up a rule or a card. One
synthesis then reconciles them into the brief; a failed analyst reaches it as a
failure, never as an invented answer. Both seats prepare at the same time, so the
brief's wall time is the slowest analyst plus one synthesis. Fresh games reuse
complete matchup briefs from Pi's cache when both exact lists, pinned source
contents, roster, guides and prompt contract match. Advice uses relative decks,
so seeds and seat swaps need no new pregame. A cache hit becomes preparation in
the new journal; a clone or resume always keeps its carried brief. The brief is filed by where
it is read: strategy reads the policies and visible card notes; the pilot reads the opening policy while it
mulligans, the note for its phase on whose turn it is, and notes for the cards
its options name. A decision about blocking does not want the mulligan reasoning.

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

**`strategy` advances the pregame setup.** One session writes each plan: the
coordinator reads the dossier and writes the plan alone. An analyst wave that
ran before it (a question per card, a branch per first action, a growth
analyst) was removed on October 10 after twenty games showed the coordinator
alone matched it at a tenth of the calls. The session prepares during the opponent's
turn. After prior scoped tactical work, it accepts or amends before
upkeep choices, then reviews the unfinished line after its draw. Opening and
unscoped legacy work retain the post-draw deadline. Jev flies the phase
scripts and ordered actions between sessions; a stop or help request changes
only the unfinished line. Short updates expand to complete accepted plans.
Notebook edits are optional parts of that answer, not separate calls. There is
no extra opening strategy session before the draw and no challenger or timeout
replacement planner. docs/PLANS.md explains the lifecycle. A phase change alone
spends nothing.

**`judge` runs only on an objection.** The strategy writer may object to one
of the opponent's actions since its last plan, beside its plan. Jev can also
object directly to a just-finished opposing block when a judge is seated. The judge looks
up the rules on disk, rules legal or not with a cited rule, and names the
remedy: the action stands, or the game rolls back to just before it. The judge
decides; no seat is asked to agree. A rollback is a journal line, the lines it
rolled past stay in the file, and every seat plans again (`src/context/ruling.ts`,
`journal.rollback`).

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
`/magic host` sets a new table. `/magic clone <game> <version> <id>` copies a
prefix. `/magic resume <id>` replays a journal and seats it again, ready to play
on from where it stops. A command that claimed to play a clone and instead
started a fresh game carrying another game's briefs was neither of those things.

### Hosting a table

`/magic` starts nothing by itself. It opens a menu. `/magic host` sets a table:
the game type, a deck per seat, and who plays first. Standard alpha, main decks
only and one on one, is the only type so far.

The host runs every seat, and every seat agrees twice to the table as set:
- `/magic start` asks the seats to prepare. A coin flip orders them, decks
  register, card assessments load and the seats write their briefs.
- `/magic begin` asks the seats to begin. The hands are dealt and the mulligans
  start.

A seat its AI pilots agrees as soon as it is asked; a player answers when they
answer. The game then plays beside the session, and the host directs it:
- `/magic pause` and `/magic continue` hold and release the next seat asked;
- `/magic rollback <version>` takes the game back;
- `/magic end` ends it with no winner.

Rollback and end are rulings by the host, so they are journal lines that replay
honors. The host's view is the spectator's: the play-by-play, the table widget
and the public board. `design-ref/pi-ux-plan-20261012.md` holds the plan for
remote seats, people at a seat and the assistant.

Who pilots a seat decides what happens to its AI's picks (`docs/SEATING.md`).
A seat piloted by its AI plays them; `/magic seat <n> player` sets a seat for
a player, who sees them as suggestions. Each seat chooses its own decide,
pregame and strategy models over the roster file's with
`/magic seat <n> model <role> <pattern|default>`, and whose OpenRouter key
pays with `/magic seat <n> key game|$NAME`; a player can give their own key.
The journal header records each seat's pilot, models and key source, never a
key. Each seat has a code, and whoever holds it pilots the seat. The host holds
every code: `/magic pilot <n>` pilots a seat from this terminal, and the host's
start and begin agree for it.

A player pilots from the seat's page, on the server that shows this Pi's games:
`/magic seat <n> link` prints `<address>/seat/#<code>`, and `relink` gives the
seat a new code. Before play the page shows the table as set; the player
chooses their seat's models, gives their own OpenRouter key, and agrees. The
key is held in memory, never written, and never sent back. During play the
page draws the seat's own board, live, beside its question: the folded menu
with the AI's pick marked, numbers to choose, Enter for the AI's pick, pass,
the pilot's mode and stops, tell and concede. The cards the question can use
glow on the board; a click on one shows only its options, and two quick clicks
on a card with one option take it. An option names its cards by where they
sit on the board (`boardPlaces` in `src/board/cardboard.ts`), never by engine
id. Every question is numbered, so an answer meant for one never lands on the
next. The host's table shows whether each player's page is open.

A seat's pilot sits over its AI as the autopilot (`src/seating/person.ts`).
In suggest mode the autopilot proposes each choice and the person types a
number, `ok` for its choice, or `p` to pass; auto hands the seat to the AI and
manual plays without asking it. Preparing card
uses is no choice, so the autopilot does it in every mode. A question with one
real option is answered at once unless the turn's plan is owed first, and
options that come to the same thing are one line: payments fold only over
permanents alike in everything the seat sees, as core groups mana sources. Smart stops ask at
priority only in the seat's own main phases and when another seat has
something on the stack, unless the autopilot wants to act; `/magic stops all`
asks everywhere and `/magic pass turn` passes the rest of the turn. The seat
panel shows the board in words from the seat's own view. `/magic tell <words>`
passes the person's instruction to the autopilot's strategy as a plan request.
While this terminal pilots a seat, the Pi chat agent is the seat assistant, with
`magic_seat` (this seat's view and the text of the cards it can see),
`magic_choose` and `magic_tell`. The ledger records the person's own picks as
`by: person`.

The table has a clock for players: 120 seconds a decision by default,
`/magic clock <seconds|off>` before the start. It runs while a player is shown
a question, never while the AI works out its suggestion. A player who does not
answer in time concedes their seat, which is also how a player who left leaves
the game; the AI never answers in their place. The concession is a ledger row
with the reason `timeout`, never `chosen`, and replay applies it. Pausing
stops the clock. A seat its AI plays is not on it; its call limits bound it.

Pictures dress the table when cardboard-api is installed. Each seat has a
look: its portrait in every picture, and the background and frame colours of
its own pictures. The host's pictures have their own. All are dealt at random,
a different portrait for each seat, and set before the start with
`/magic seat <n> avatar|background <name|url|random>` and
`/magic seat <n> colors <primary> <secondary> | auto`; `/magic background` and
`/magic colors` change the host's own view at any time.
The defaults are the files in `assets/`, named by file; adding one is adding a
file, and any http(s) image URL stands in for one. A default background brings
the frame colours in `assets/backgrounds/colors.json` unless colours are set,
and a portrait that does not load gives way to a default. The journal header
records the looks.

`/magic replay [game]` writes a saved game as a page to replay in a browser
(`src/board/replay.ts`, `replay.html`). The journal replays, calling no models,
and each moment something visible happened (`src/board/series.ts`) is kept as a
cardboard-api scene for the audience and each seat; a moment that leaves every
board as it was joins the one before. The page draws the scenes live with
cardboard's own browser scripts, copied beside it with `game.js`, which holds
the scenes, the card art and the looks, so it opens with no network. Switch
perspective at any moment; hover a card for its printed text and state, click
it to bring it forward. Beside the board: what that viewer saw happen, each
seat's counts, life over the game, per-seat totals counted from the log and
ledger, and the run's time and cost when its result was saved. The page wears
the frame colours of the board being looked at. A 16-turn game writes in
seconds.

`/magic watch local|public|off` shows this Pi's games (`src/watch/`), and the
setting holds across sessions in `settings.json` beside the roster. A
server, needing no code for anything an audience may see, serves a
games page, searched, sorted and paged on the server, and each game's replay
page. Whether a game is over, who won and in how many turns come from
replaying its journal on a worker thread (`src/watch/outcomes.ts`), so a Pi
playing a game never stops for it; until a journal is replayed, its saved
result stands, marked as checking. A rollback a spectator was watching is a
moment of its own, the position play went back to.
A game with a result is served from every perspective. Any other, live or
stopped short, is served as the audience saw it, since it may yet be played
on. A game this Pi is playing is watched live: the loop's checkpoint hands the
table to it before each decision, its page receives each new moment as it
comes and follows the newest unless the viewer stepped back, and it loads again
when the game is over. Local serves on 127.0.0.1:4747; public puts a Cloudflare
quick tunnel in front, whose address changes each time. The host's table shows
the address.

Saved pictures are WebP (jSquash's libwebp build, quality 85), about a tenth
the size of PNG: the host's picture after each turn. The terminal widget is shown PNG, which every terminal image
protocol takes.

A seat can also carry its own key for a provider, named as an environment
variable under `keys` in the roster file (`"keys": {"1": {"openrouter": "$OPENROUTER_SEAT_1"}}`).
That seat's own calls use it. The judge and the commentator are the table's and
use Pi's credentials.

### What a game costs

Historical measurement before October 5's explicit priority decisions: one
game of basic lands, 108 turns, with the then-suggested defaults. These counts
are not the current execution policy or a target forced ratio:

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
returned, so every role names a requested ceiling. A route may ignore it.
Truncation records the provider's length stop, not an inferred token threshold.

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
   **Implemented:** two seats finish by deck out.
   Decision discovery is pure, simultaneous losses settle together, and cleanup
   keeps asking until the hand fits. Opening choices, turn obligations and
   priority actions have separate handlers. Views identify the current window;
   table talk is offered at actual phase endings. Control transitions move the
   cursor without writing an event, because a replay derives them; opening
   completion is derived from its obligations. **Running against a real decision
   model:** a hosted table finishes a game through Pi's classifier API. Measured
   under the former auto-pass policy at 108 turns, 2357 decisions, 95.4% forced,
   109 model calls, 0 gaps. Jev now chooses priority passes for both seats.
   `tools/sim.ts` plays bulk games on fresh seeds, each list on the play half the time.
2. **Spells and activated abilities through prepared procedures.** The first experiment
   binds visible sources, pays tap and unrestricted mana costs, resolves two
   draw/discard abilities in stack order, and clones during a pending discard.
   Accepted claims and instructions are journaled. Every legal card is
   assumed supported; `cards/unsupported.txt` lists the ones that are not, and
   a deck containing one is refused. A seat uses a card
   through the syntax in `docs/SYNTAX.md`, as procedures it announces and
   packages its permanents register as they enter. Model-backed setup assesses
   standing terms and identifies uses before play. Priority requires an
   interpretation of deferred uses with visible, permitted sources, then offers casts and activations to any
   player adapter. Lands and registered mana abilities pay during casting
   (601.2g). Strategy prepares during the opponent's turn and accepts or amends
   before upkeep when scoped, then reviews after the draw. Jev chooses every
   voluntary action and pass. `npm run matchup`
   plays the pinned lists live and stops at the first gap.
3. **Triggered abilities** and trigger ordering. `enters` is 48.5% of all
   triggers in Standard. **Implemented:** `commit` reads each group's events
   (enters, leaves, dies, cast, targeted, attacks, combat damage, step
   beginnings) and matches registered watches and delayed triggers; leaving
   the battlefield looks back to before the group. Triggers wait on the table
   and go on the stack, active player first, before the next priority.
   Intervening "if", "you may", "once each turn", reflexive triggers and
   suppression work. Cleanup expires damage and temporary effects together,
   then handles state-based actions and waiting triggers. Either exception
   gives both seats priority and requires another cleanup (514.3a).
4. **Static abilities and the layer walk.** The hardest part. `docs/COMBAT.md`
   has the sublayers, taken from 613.4. **Implemented:** `characteristics.ts`
   walks types, abilities and power/toughness from registrations, labels and
   counters; state-based actions read it, including indestructible, deathtouch,
   tokens, Auras, Equipment, counter cancelling and the legend rule as a choice.
5. **Replacements**, including the ones on `enters`. **Implemented:** entering
   tapped or with counters, from a permanent's own package or another
   permanent's (Zhao), and "if it would die, exile it instead". Ordering two
   replacements on one event is not.

The engine's main job is bulk one on one games, so that interesting positions
can be frozen as benchmarks. `tools/sim.ts` plays them, two at a time; seat 0 is always on the play, so it seats each list first in half its games. Its `--green` and `--red` options give one list's seat its own strategy model, so one roster can face another: run the arm twice with the patterns swapped and count wins by roster, not by list. A fixture is a
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

No derived value is stored on an object. A creature's power is read through the
layers every time it is asked for; `characteristics.ts` memoizes one walk per
table revision and drops it on the next commit. If a change would be easier by
storing one, the walk is in the wrong place.

The table never reads printed card text. Meaning arrives as structured terms,
checked against an enumeration before anything moves. Printed type line, mana
cost and power/toughness are structured fields, not text, so the table reads
those from the pinned card file rather than trusting a claim.

A compulsory rules operation with one option is forced. A priority pass or
combat declaration belongs to the seat even when only one option is listed.
Jev selects every voluntary action and pass, including a unique planned action.
No code passes for a seat; the pass option states what passing does now. A resolving card instruction
can be delegated with that seat's explicit authorization. Strategy calls and
escalations add no physical decision. Read reasons beside total calls, tokens,
cost and elapsed time; the forced ratio is not a gameplay target.

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
- **Forced.** Compulsory single-option rules operations are automatic. Priority
  passes and combat declarations reach the seat, and no row is a `fallback`.
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
- **Hosted.** Nothing deals until every seat agrees. A paused game asks nobody
  and, played on, is the game it would have been. The host's rollback and end
  are journal lines that replay honors; a clone before either, or a rollback
  past an end, is the game without it. A direction the table refuses changes
  nothing and play goes on. A clocked seat that does not answer concedes as a
  timeout, paused time does not count, and replay concedes where the clock
  did. Through the extension itself: a table replaced
  while another prepared keeps its own game, and a seat's models and keys
  follow it through the coin flip, journaled as `setAs` so a resume keeps them.
  A seat's own models and key pay for its calls. A player who stops answering
  loses on the clock, and the seat's AI never answers for them. The host pilots
  a seat from its terminal, and its picks are the person's rows. A player on
  the seat's page chooses its models and key, agrees, and answers; the key is
  never sent back or journaled. A seat's code opens that seat alone, with its
  own hand face up and no other, and nothing is changed without one.
- **Alone.** A finished game reports and returns with nothing else keeping the
  process alive. Stated in a child process, since a test runner keeps the event
  loop awake and hides it.
- **Dialled.** Following a route changes what a seat knows and nothing else:
  the table is byte for byte unchanged, the obligation and the moves offered are
  the same, and the rule arrives labelled as something the seat asked for. Every
  route cites rules that resolve and carries their text. A route id reads as an
  ask, never as a move, and says what it does not show. A walked route is not
  offered again and the budget ends the walk.
- **Planned.** A plan is accepted whole or refused whole with every problem
  named, and accepting it moves nothing. The table raises a stop once a turn
  within the budget and marks options without removing any. Jev chooses the
  action or pass. Progress is
  read from the ledger rows that carried each step out, so replay and clones
  hold exactly the progress of their prefix.
- **Assessed.** Model-written terms cover their source and survive replay and
  cloning. Shared casts need no empty per-card program. Standing abilities are
  present on entry, and accepted procedures survive later plan edits.
- **Ready.** Identified casts and activations need no executable body until a
  visible source enters their accepted scope. Unpermitted zones and another
  seat's hidden hand create no work. Required interpretation blocks actions
  and fallback passes, moves nothing, and survives replay without reinference.
- **Considered.** A pilot's action question carries the phase instructions and
  derived status of unfinished steps and branches. False conditions, later
  steps, stack prerequisites and unavailable uses remain distinct; none counts
  as execution. Passing confirms the current completion or waiting conditions.
  Unmentioned cards create no separate strategy review. Every move stays available.

`npm test` runs the fast invariant lane; `npm run check` runs the types. Both
pass on every commit. `npm run test:slow` runs the nine whole-game invariant
files named in `tools/test.ts`; run affected slow files when changing their
behavior. `npm run test:all` runs both lanes before a completed batch is pushed
and before a release. All lanes accept `-- --concurrency N`. Neither makes a network call: the decision model is a
double whose shape is Pi's own `classify`. `npm run smoke` is the live run, opt
in, and it reports the seed, the outcome, the model calls, the forced ratio and
the gaps. Tests live in `test/` and ship with nothing:
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
  loop.ts              the serial game loop: ask, retry once, fallback, stops, loop guard, objections
  journal.ts           the stored form: header and lines, replay, clone, rollback, torn-line repair
  view.ts              projection: the one reader on a seat's behalf, visibility as a filter
  player.ts, intent.ts the Player interface and refusals; what a seat means to do
  budget.ts            the mana and payment forecast a plan is checked against before acceptance
  announce.ts          the announcement options a seat's packages and plan offer
  targeting.ts         target counts and the division fixed before payment
  knowledge.ts, odds.ts what a seat knows and the odds it may work out; transitions unfinished
  derived.ts, declare.ts, say.ts  unwritten derived facts and raw declarations; table talk
  concede.ts         a concession as a ledger row, chosen or on the clock's timeout, that replay applies
  syntax.ts, names.ts  zone, reason, change and layer types; seat names
  combat-facts.ts      block conflicts and strike order facts for the pilot
  readiness.ts, assessment.ts, purpose.ts, moves.ts  which uses have sources, assessment coverage, a stack object's purpose
  work.ts            a seat's private equipment: its accepted plan and packages
  language.ts        the syntax a seat writes: procedures, registrations, plans
  work-language.ts   the checked JSON tool vocabulary, not model-written code
  work-tools.ts      atomic equipment edits and plan checks, separate from motion
  planning.ts        where a seat is in its plan: due steps, branches, stops, holds
  review.ts          the current decision's checklist and the seat's recorded judgments
  query.ts           whether a window is now, and which projected objects a query names
  printed.ts         type line, mana cost and power/toughness from the card file
  card-names.ts      source-pinned Oracle names and printed types, independent of deck legality
  decks.ts           a deck, its registration for a game, and the kept collection
  entry.ts           what a permanent registers as it enters, and how it enters
  damage.ts, damage-order.ts  damage modifiers and affected-player ordering before simultaneous results
  draw.ts, draw-order.ts  batch draw replacements, affected-player choices and sequential player draws
  copies.ts          copiable base terms, public-card and spell copies, required activation preparation
  entry-copies.ts     targetless entry copy choices and copiable exceptions
  durations.ts       immediate returns when an exile-until duration ends
  entry-payments.ts   named choices and optional entry payment before a battlefield route commits
  casting.ts         casting provenance and actual mana spent, read from recorded events
  activated.ts       abilities carried by permanents and the shared loyalty activation allowance
  costs.ts           shared physical payments for announcements and resolving instructions
  casting-costs.ts    standing generic reductions and additional life costs at cost locking
  cost-selection.ts  staged graveyard payments by total mana value, before any resource is spent
  search.ts          recorded library searches and their private inspection windows
  inspection.ts      bounded private looks and chosen or random library ordering
  library-keywords.ts scry, surveil, manifest dread and explore with recorded completion
  cast-words.ts      properties applied to matching spells during announcement
  faces.ts, rooms.ts  face characteristics, casting faces and unlocked Room doors
  sagas.ts            chapter entry, lore on the main-phase boundary and completed Saga sacrifice
  manifest.ts         face-down creature characteristics, private identity and paid face-up actions
  speed.ts            player speed, its state-based start and source-less inherent trigger
  triggers.ts        events read from each group, watches matched, the trigger window
  combat.ts          declaring attackers and blockers, dividing and dealing combat damage
  permits.ts         extra land plays, lands from other zones, flash, "you may play that card"
  sacrifice-costs.ts optional casting sacrifices and affordability without subset enumeration
  funding.ts         paying a cost: floating mana and mana abilities while paying
  tap-costs.ts, subsets.ts  shared tap-cost selections and bounded-size object subsets
  mana-cost.ts       nonhybrid equivalents of printed or stated costs, chosen before targets and reductions
  special.ts         accepted plot actions and their later-turn casting permission
  payment-options.ts, payment-search.ts  exact partial mana choices and payment feasibility without enumerating combinations
  complete-payments.ts bounded complete payment menus, with the individual path retaining every physical choice
  announcement-options.ts, announcing.ts  source, X, targets and payment selected privately before one confirmed operation
  procedures.ts      one offer path for plans and default casts, activation terms
  characteristics.ts the layer walk: what an object is now, never stored
  selectors.ts       refs, selectors, amounts and conditions read against the table
  physical-history.ts public descend, face-down entry and face-up action counts from receipts
  resolution.ts      remaining instructions and choices before a checkpoint
  choice-actions.ts  recorded private choices before a simultaneous sacrifice, discard and life-loss group
  resolution-counts.ts  completed uses of a source-backed ability within this turn
  pregame.ts           the opening procedure and its choices
  turn.ts, steps.ts    turn obligations, step order, and phase boundaries
  priority.ts          actions offered to the current priority holder
  decisions.ts         the ordered dispatcher and application of listed picks
src/context/           questions for a decision model. Its own AGENTS.md
  roles.ts             which model answers which part, and why each default
  model.ts, reason.ts  the two adapters onto Pi: classifier, and chat
  claude-cli.ts, claude-process.ts  explicit CLI provider and isolated subprocess transport
  spend.ts             what every call cost, and the output ceiling per role
  brief.ts             the pregame wave, and the snippets it files by use
  brief-cache.ts       source- and roster-pinned matchup advice for fresh games
  assess.ts            standing terms and the inventory of uses before dealing
  interpret.ts         deferred uses prepared through the selected strategy model
  summary.ts           the turn in two sentences, from the spectator view
  strategy.ts          a turn's plan, and reconsideration on an escalation
  plan-edit.ts         short strategy updates expanded into complete accepted plans
  strategy-facts.ts    projected position, resource forecasts and reference tools
  ruling.ts            an objection, its cited rule and remedy
  dial.ts              the routes a seat can ask for, answered from the rules
  packet.ts, seat.ts   one decision's context, and the seat that answers it
  sit.ts               seating a whole table, so one command cannot differ
  guides.ts            deck guides under decks/guides, read by the pregame analysts for both lists
  coordinator.ts       the coordinator's system prompts and task sections
  dossier.ts, dossier-strategy.ts  the projected position rendered for the writer, and the model-written sections
  choices.ts, choice-space.ts, decision-facts.ts  inspection of option variants and the facts a decision carries
  strategy-actions.ts, strategy-combat.ts, strategy-permissions.ts, strategy-position.ts  action text, the combat lookup, permissions, card definitions
  metrics.ts, trace.ts usage arithmetic and the bill; exact requests and replies when tracing
  playbook.ts, plan.ts the policy schema; the starting intent
src/core/host.ts       the host's rollback and end, kept as rulings by the host
src/seating/           who pilots a seat
  lobby.ts             seats, decks, pilots, models, keys, codes, who plays first, and the two agreements
  hold.ts              the host's hold on a running game: pause, continue, the clock, and directions between loops
  person.ts, panel.ts  a person over a seat's AI, its stops and menu; the seat in words
src/watch/             showing games to spectators and rewatchers: read-only, never a seat
  games.ts             saved games: summaries, search and paging, moments, looks and run cost
  outcomes.ts          a worker that replays journals, so the list knows how each game stands
  server.ts            the watching server: the games page, replays, a live game as it plays, and each seat's page behind its code
  games.html           the games page
  tunnel.ts            a Cloudflare quick tunnel's public address
src/board/             board pictures: no game logic, never read by a seat
  snapshot.ts          the board as one viewer may see it, renderer-neutral and pure
  render.ts            the renderer seam, the art map, and SVG to PNG or WebP through resvg and jSquash
  cardboard.ts         the interim renderer: a snapshot as a cardboard-api MTG 26 scene (optional dependency)
  looks.ts             seat portraits and table backgrounds: the defaults in assets/, or image URLs
  series.ts            a saved game as moments, each as the audience and every seat saw it
  replay.ts, .html     those moments as cardboard scenes and a page that draws them, with the game's totals
  feed.ts              one picture per turn and at the end, drawn off the game loop and saved
tools/cards.ts         build a card list from Scryfall, any format or all of it
tools/card-names.ts    build the Oracle name companion from a matching cached bulk snapshot
tools/card-art.ts      pin one Scryfall printing per card for board art, from the same snapshot
tools/rules.ts         build a searchable Comprehensive Rules
tools/sim.ts           bulk games: carried seeds of one matchup, or seeded random pairings from the deck pool; one table per arm
src/core/packages.ts   source-checked card interpretations, reused through shared seating for new games
tools/assess.ts, tools/assessment-pool.ts  complete universe batches or standing deck preparation, with source review and resumable refusals
tools/coverage.ts     source-pinned preparation counts and card-level worklists from the shipped store
tools/guide.ts         one deck guide per list, written by the pregame model and kept under decks/guides
tools/decks.ts         the deck collection as a formal list of names: check every list against the legal set, import a published text list
tools/adherence.ts     plan adherence read from a journal on replay: picks that carried out a due step
tools/smoke.ts         one live game against a real model. Opt in, costs money
tools/matchup.ts       the pinned Standard matchup, live through Pi, unscripted
tools/matchup-fixture.ts  the pinned lists, card and rules pins, and a table from a journal header
tools/benchmark.ts     saved-position probes: offline checks, live arms, continuations, the pilot lab (benchmark-*.ts)
tools/pregame.ts, tools/ability-fixture.ts  a pregame alone; a frozen ability position
tools/stats.ts, tools/timeline.ts  read a saved result; render its timeline
tools/game-report.ts   compact reports and saved results for each run
tools/source-review.ts, tools/review-game.ts  private card-meaning evidence beside pinned sources
tools/game-timeline.ts offline timeline rendering; HTML and script beside it
cards/unsupported.txt  legal cards the engine cannot play; a deck with one is refused
docs/SYNTAX.md         the syntax, the table's line, and execution semantics
docs/examples/         worked uses of the syntax by shape, checked against card text
decks/collection/      decks kept for tests and play: tournament lists and practice decks
decks/standard-matchup.json  the pinned matchup: its two lists, legality date, card and rules hashes
docs/STANDARD.md       first real opening, observed failures and mechanics inventory
docs/STATUS.md         what is established, what is open, and the current baseline table
docs/IMPROVEMENTS.md   the next change and how it is judged, one page
docs/PLAYBOOK.md       the pregame policy families the brief is filed into
cards/standard.tsv     5164 cards, committed, every field checked against source
rules/cr.tsv           4063 rules, headings and glossary terms, committed
docs/PLANS.md          the plan a seat flies: what it holds, how the table flies it
docs/COMBAT.md         characteristics, the layer walk, combat, and the seams
docs/MULLIGAN.md       the opening: the rules, the three decisions, what a seat knows
docs/SEATING.md        seats, pilots, codes and the clock, for a reader with no code
docs/STATE.md          export, rollback, copying a game, and hosting options
docs/ZONES.md          the zones, identity, exile, dungeons, outside the game
design-ref/            observations about Magic, on disk and not ours to publish.
                       Its own README says what moved to archive/ and why: the
                       documents that decided a design have been superseded by
                       docs/PLANS.md and docs/SYNTAX.md, and the ones that measured the game stand
```

`npm run cards` rebuilds the standard list and `npm run universe` writes all
32,870 cards with every column. `npm run rules` rebuilds the rules. `npm run sim`
plays bulk games, `npm run benchmark` runs saved positions, `npm run stats` and
`npm run timeline` read a saved result, and `npm run pregame` prepares alone. All three
verify every carried field against the source and refuse to pass on a mismatch.
`/magic cards` and `/magic rules build` run them from inside Pi.

## Not built yet

- Strategic quality. `strategy.planWork` writes a checked plan, and offline
  doubles exercise how the table and Jev fly it. Pregame analysis and background
  turn preparation work. Live games and replay matching have not measured playing
  strength; legality audits and controlled comparisons remain necessary.
- Widening routes. `more-options`, `better-targets` and `replan` need machinery
  that does not exist, so nothing advertises them. The rules routes in
  `src/context/dial.ts` are the ones that work, because the rules are on disk
  and answering one costs no model call.
- General declaring and delegating. A model-backed seat can execute prepared
  procedures. Core honors `Intent.deck.delegates` for unique card continuations
  when a seat's intent explicitly names the situation; the model adapter does
  not set it or offer a tool to change it. Raw
  `declare` and free-form delegation still throw or leave the decision pending.
  Objections and the judge's rewind work through the core loop.
- Parts of combat no card in the matchup needs: attacking a planeswalker or
  battle, a creature blocking more than one attacker, lifelink, and counting
  other creatures' damage in the same step toward trample's lethal (702.19b).
- The derived facts. `summary`, `manaCurve`, knowledge transitions and the
  replacement-hand spread are unwritten. Registered-count odds use projected
  facts; remembering reveals and private reorders still needs knowledge transitions.
- Declaring, and `judge.playOn`. A game finishes without them.
- Provenance beyond the accepted claim. The journal now carries each executed
  procedure's basis, instructions, payment and delegation. Replay uses those
  accepted terms. Model and interpreter version attribution still needs work.
- Controlled model comparison. `npm run smoke -- --trace` saves exact requests,
  replies and errors, including the recaps each call received. The trace is
  private seat data. The forced ratio is evidence about cost, not decision
  quality; a comparison harness and version attribution remain unfinished.
- The MCP adapter over the seat API is next in `design-ref/pi-ux-plan-20261012.md`.
- Any format but Standard, and any seat count but two.
