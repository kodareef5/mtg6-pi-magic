# Drafts, appointments, and consideration

A seat can prepare a sequence, schedule future attention, and account for the
concerns it reviewed before passing. The LLM supplies the strategy and the
prepared guidance. The classifier executes and notices through fixed choices.

[The real Standard matchup](STANDARD.md) now exercises casting and targeted
damage from ordinary setup. The experiments below remain regression fixtures.

## Try the first experiment

```
npm run circuits -- --out .pi/circuit-review --quiet
```

Open `.pi/circuit-review/index.html`. The timeline shows each accepted equipment
edit, the draft's completed and remaining steps, the agenda, labels, and the
individual dispositions within a review batch. The output directory also holds
text traces and JSON for all three scenarios.

The first two runs use the real game loop with authored strategy and classifier doubles.
One preserves a card across turns. The other deliberately discards it during
cleanup. At the next priority opportunity, the classifier requests strategy,
which revises the remaining sequence and releases the obsolete reservation.
Neither repeats the completed land play. Three upkeep checks lead to a final
strategy request. These runs verify choreography, not strategic quality.

`ability-exchange` starts with two established Qiqirn Merchants and basic lands.
The fixture waits until turn three, after both controllers have begun a turn,
then each seat makes mana and pays for the Merchant's first ability. The second
activation responds to the first. Each draw is delegated; each discard is a
separate choice. The inspector includes public board snapshots through this
exchange. Setup is a fixture, not a simulated casting sequence. Journal tests
use that same fixture constructor to reproduce its initial position.

The cleanup preserves the recorded baseline exactly, including physical histories
and ledger reasons. Every scenario finishes with seat 0 winning and zero gaps.

| Scenario | Strategy calls | Classifier calls | Forced / delegated / chosen / declared / fallback |
|---|---:|---:|---|
| Normal reservation | 2 | 74 | 2243 / 0 / 113 / 0 / 0 |
| Lost reservation | 3 | 75 | 2243 / 0 / 113 / 0 / 0 |
| Ability exchange | 2 | 29 through exchange; 130 whole game | 2129 / 2 / 105 / 4 / 0 |

These counts describe the authored doubles. They are a regression baseline,
not a measure of strategic quality or expected paid-model performance.

For actual Pi models, `/magic play <seed> circuits` or
`npm run smoke -- --circuits --strategy <pattern>` enables preparation. These
make paid calls; the offline experiment does not. Ordinary play retains its
existing path. A resumed game carries whichever equipment it already owned.

Add `--trace` to the smoke command to capture each model request before dispatch,
then its reply or error under the same call id. The calls file contains private
seat data, is created with owner-only permissions, and omits Pi's authentication
and transport settings. Each request also checkpoints the game journal. This
preserves accepted progress when an external test limit interrupts a run.

## Live checks

On October 4, 2026, a dedicated tmux session drove Pi 1.0.1 through its command
input. The classifier was `typesafe/jev-latest`; pregame and strategy used
`gpt-6.1-sol:low`, and summaries used `gpt-5.6-luna:low`.

`/magic play tmux-live-20261004` finished the basic-land game in 108 turns:
2248 forced and 109 chosen decisions, no fallbacks or gaps, and an exact journal
replay. Its 234 model calls cost $0.0704 at the recorded catalog prices.

A fresh established-board Merchant probe completed both activations and their
resolution with no gaps or fallbacks. Two mana procedures funded the two stack
abilities; the responding ability resolved first. Both draws were delegated,
and each seat chose its discard. Replay matched the ledger and objects.
The exchange used 41 classifier calls and two strategy calls, cost $0.0492, and
took 76.4 seconds. These are functional checks, not a playing-strength measure
or a full-deck game; the probe stops after the exchange.

The probes exposed two passes offered despite pending work: an ordinary pass
while a draft was due, and a prepared pass before a nomination had a disposition.
The classifier now omits the first, and the prepared menu and execution share
the second refusal check. Another failure showed the validator reporting an
unrelated tool's fields for a draft edit missing `steps`. It now reports the
selected tool's errors. Strategy instructions explain persistent reservations
and edits containing only remaining instructions. Resumes preserved the paid
costs and completed steps while these failures were repaired.

A separate basic-land circuit continuation reached turn 63 before an external
180-second test limit. It remains unfinished and is not counted as a clean game.

## Two revisions

The physical table has its existing clock. Each seat's equipment has a private
revision. A tool batch edits only that equipment and is accepted atomically.
No card moves, no cost is paid, and priority stays with the same seat.

The core records accepted tools and equipment in a private journal history.
Projection carries the viewer's equipment, visible objects and public registered
deck counts. Registration does not identify hidden objects. Library identities
and another seat's hand never enter a selector. An unknown public
object retains its handle and shape without a card name.

A full journal is private. A public export excludes equipment; a seat export
includes that seat's equipment. Cloning carries accepted preparation without a
fresh inference call. Execution also names the draft and step on the physical
ledger row, so a torn equipment write cannot make that action unexecuted again.

## What a schedule means

`when` can name the active side, a phase or step, and inclusive global turn
bounds. `self`, `opponent`, and `any` refer to the viewing seat. `fromTurn` and
`throughTurn` count table turns, not rounds or a player's own turns.

`times` bounds the number of distinct matching step visits assessed. Omitting
it repeats indefinitely. A changed position reopens an assessment in the same
visit without consuming another repetition. A repeated phase or step is a new
visit, even within the same turn. A phase selector matches its individual
priority steps; use a step selector for one appointment per turn.

`after: { task, runs }` enables a follow-up after a named check has been assessed
at that many visits. For example, monitor at three of your upkeeps, then
reconsider the investment in your following main phase. Cyclic dependencies
are refused. Deadlines expose missed checks for acknowledgement; missing a
window never counts as completing it or causes late execution.

Checks run at priority opportunities. A schedule cannot grant priority, skip a
turn obligation, or act inside an effect. The first version refuses untap and
cleanup appointments, which need a different safe observation boundary.

## What a review establishes

A task supplies a selector over visible objects, named concepts, concerns,
guidance, and optional recipes. Every scoped object and concept receives every
named concern. Labels on scoped objects add their own review items. Unlabelled
new objects still appear. One object can hold several roles.

The classifier answers these independent questions in one request. A partial
or invalid batch records no dispositions. A disposition can say no action is
warranted, nominate a recipe, defer to an existing future check, or request
fresh thought. Nomination prepares nothing by itself. A nominated recipe must
be adopted or declined before passing.

Completed consideration is relative to the visible position and the supplied
guidance. It does not certify optimality, prove the scope includes every useful
concept, or complete a card instruction. The current signature conservatively
reopens reviews after visible position changes. Passing alone does not reopen
them. The classifier packet carries current work and progress counts, not all
historical dispositions or executable draft bodies. Step labels and windows,
guidance, completed progress, bindings, reservations and status remain visible.
Strategy receives the full edited draft and recipes when asked to reconsider.

Due attention prevents a pass. The classifier sees the work's disposition
choices instead of an ordinary pass that core would refuse. Other listed plays remain available.
Two unusable answers leave the decision pending with a gap; the table does not
mark a review complete or silently pass for the player.

The core also bounds accepted equipment edits at one physical version. The
default is 32 batches; exhausting it records a budget gap and leaves the same
decision pending. It does not choose a pass, cancel a draft, or approve a
review. Accepted edits count again on resume. A caller can explicitly supply a
larger budget to `play`; repeated delivery also consumes this invocation's
budget even when it edits nothing. Other accepted answers that leave the
physical version unchanged also consume the invocation's budget. This applies
to every kind of player.

## What a draft establishes

A recipe contains editable steps, guidance, and reservations with a purpose.
Each step binds a listed move or a prepared procedure. Listed moves can be
filtered by id, prefix, or explicit visible object references. Option
ids are opaque; a binding retains every referenced incarnation, including
options involving several objects. A reservation identifies an object incarnation
and can require its tapped state. It expresses a strategic preference, not a
rules restriction on other players or the ordinary move list.

The seat opens a recipe, binds its next move, accepts readiness, then executes.
Recipe adoption and dismissal show the prepared guidance and sequence labels,
so the classifier can assess the proposed line before a draft exists.
These are separate choices. Readiness records the position it assessed; a
changed position requires acceptance again. Execution recomputes the offered
move and checks bindings and reservations before using the normal commit path.
Only an executed action advances the draft. A listed move is recorded as chosen;
a prepared procedure is recorded as declared, with its accepted terms.
Choosing an ordinary play outside the draft leaves its progress unchanged, even
if that play consumes the card its next step expected. The classifier menu names
this consequence beside ordinary actions and explains bind, ready, execute.

The sequence pauses when its next step belongs to a future window. Changed
reserves and missed execution windows surface for inspection, cancellation,
deferral, or strategy. Editing replaces only unexecuted steps; completed steps
stay completed. Parking accounts for this opportunity and does not abandon the
future sequence.

Reservations apply before every remaining step; execution does not release them.
An untapped reservation on a source consumed by an earlier step therefore needs
an explicit edit. `draft.edit` requires the remaining steps even when the edit
only changes reservations or guidance. Core retains the completed prefix.

## A prepared procedure

The first physical vocabulary is deliberately small. A procedure selects a
visible source, states a claim and its basis, names its cost, and carries an
ordered list of instructions. The strategy role receives card text for visible objects and public registered
lists. No per-card compiler runs.

For the Merchant, the action portion of a recipe step is:

```json
{
  "procedure": {
    "source": { "zones": ["battlefield"], "controller": "self", "card": "Qiqirn Merchant" },
    "claim": "Qiqirn Merchant: draw, then discard",
    "basis": "{1}, {T}: Draw a card, then discard a card.",
    "timing": "stack",
    "cost": { "tap": true, "generic": 1, "colors": [] },
    "instructions": [
      { "do": "draw", "who": "self", "count": 1 },
      { "do": "choose-move", "who": "self", "from": "hand", "to": "graveyard", "reason": "discard", "count": 1 }
    ],
    "delegate": true
  }
}
```

The menu binds a source incarnation and specific mana units. Payment supports
unrestricted colored and generic mana. Identical units share a menu option;
units with different persistence do not. Restricted mana remains unsupported.
Binding, readiness and execution show the source id and incarnation, stated
cost, mana colors and persistence, effect order and timing. Those details reach
the classifier without decoding option ids. The cost is checked again at
execution, before either tapping or spending.
This proves the stated resources existed, not that the card has that ability
or that the player interpreted it correctly.

Immediate mana procedures currently only add mana. Stack procedures create a
noncard object in the existing shared stack order. The claim, basis, cost,
payment, instructions and delegation become public and are frozen in the
physical journal. Private strategic guidance stays in the recipe. Editing that
recipe later cannot rewrite an ability already on the stack.

A spell procedure selects a card in hand and uses `timing: "spell"`. Its
`spell` terms supply `speed` (`instant` or `sorcery`) and `destination`
(`battlefield` or `graveyard`). Printed power and toughness come from the
card file, never the claim. An ordinary creature such as Llanowar Elves has an empty
resolution instruction list; its activated ability is a later procedure.
The source card itself moves to the stack, retaining the accepted terms until
resolution completes. Costs and targets are checked before any card moves.

`target` offers one `creature`, `player`, or `creature-or-player` selection.
The announced incarnation remains fixed. `{ "do": "damage", "amount": 2 }`
marks damage on that target, or reduces a targeted player's life. If the only
target is unavailable when resolution starts, no instruction runs and the
spell goes to the graveyard. A creature's lethal marked damage is checked after
the whole effect, not between instructions. This first check uses accepted
base toughness; layers, prevention and indestructible need more machinery.

After consecutive passes, the top ability begins resolving. Its instruction
index and remaining count live in the table. A draw does not expose a library
identity in its option; a following choice sees the hand after that draw.
Nobody receives priority and no state-based check runs between those
instructions. Finishing the effect reaches a checkpoint, then the active
player receives priority before another stack object can resolve.

`delegate` is the seat's explicit permission for a unique continuation to run
without another classifier call. Such a row is delegated, never forced.
Choices among several options still ask the affected seat. One seat cannot
delegate another seat's choice. Without delegation, even the single draw
instruction waits for the seat. A clone at the following discard retains the
draw's result, the remaining instructions, and the unresolved stack beneath it.

## Tools and boundaries

`src/core/work-language.ts` is the checked JSON vocabulary. It offers task
put/cancel, recipe put, label put/remove, review answer, missed-check
acknowledgement, draft start/bind/edit/ready/park/cancel, nomination dismissal,
and strategy request/accept. Queries and menus are pure. `work-tools.ts` owns
equipment writes, and the game loop owns physical execution.

The Pi tool `magic_work` reads or edits a selected seat's equipment while the
game waits. An edit must supply the equipment revision. It returns the visible
objects, pending reviews, and menus; it never executes an action. `/magic work
[seat]` provides inspection. The strategy role returns a checked tool batch
through the same vocabulary, and may prepare or revise work without answering
reviews or executing moves for the classifier.

The vocabulary remains provisional. Procedures activate face-up permanents or
cast cards from hand under their controller's priority, with unrestricted mana
and source tap costs where applicable. Instructions add mana, draw, change
life, deal literal damage, or choose one card to move. Wider casting and target
restrictions, amounts computed later, complex or simultaneous multi-card payments and choices,
mana abilities inside a payment, triggers, replacements, continuous effects,
and the judge's remedy remain unwritten. Legality and card interpretation are
claims the table records, not certifications these tests establish.

TypeBox is a runtime dependency deliberately: core validates externally authored
JSON against the same schemas published to the strategy role and Pi tools.
It has no dependency on Pi's runtime or model providers.

Other open choices are the size of a review scope, when a changed fact should
reopen which concerns, the treatment of cancelled prerequisites, and the cost
of retaining complete equipment snapshots in the journal. Those should be
settled by more experiments rather than a larger scheduler framework.
