# The syntax

How a seat uses its cards. `src/core/language.ts` holds the schemas; this file
explains them and the rules each one comes from. Every shape traces to a motion
or decision in `design-ref/HOW-MAGIC-WORKS.md`.

A card is not compiled into this syntax. A seat reads the card and writes what
it means to do now: the procedure it announces, and what its permanent registers
when it enters. The table checks the shape, conservation and visibility. It does
not check that the card says so. Another seat can object, and a judge rules.

The schemas parse, the table runs procedures, registrations and plans, and
`test/examples.test.ts` checks every example against them.

## The table's line

The table guides and never restrains.

- It never hides a physically possible choice because of something a card says.
  Flying, menace, hexproof, "can't be blocked", "can't gain life" and "can't be
  countered" are for the players to observe and the judge to enforce.
- It marks an option that conflicts with a registered word. A lone blocker
  against a registered menace attacker reads "conflicts with menace: needs two
  or more blockers".
- Resolution offers a target check for hexproof gained before it begins. The
  seat can ignore those targets, leaving any legal targets to resolve (608.2b).
  The original instruction remains available with its conflict marked. Once
  instructions begin, gaining hexproof does not restart that check.
- Registrations change what it derives: characteristics, how a permanent enters,
  which triggers fire. They change steps it performs itself: first and double
  strike, trample, vigilance, indestructible, deathtouch, and haste lifting
  summoning sickness. They add choices: an extra land play, flash.
- A source whose derived characteristics have lost their abilities offers no
  procedure except intrinsic mana (305.7).
- Baseline rules that read only printed or physical facts are enforced: one land
  per turn, main-phase timing for lands and non-instant spells read from the type
  line, summoning sickness, and tapped creatures not attacking. Their known
  overrides are worked examples in `docs/examples/baseline-overrides.md`, not a
  general mechanism.
- A seat's own statements narrow its own menu: its target selectors, its
  procedure's `if` and `limit`, and a spend restriction on mana it made.

`ACTED` and `MARKED` in `language.ts` list the words the table acts on or marks.
Any other lowercase word is recorded for the players and the judge.

## Pointing at things

**Refs** name one object or player inside a procedure or registration.

| Ref | Means |
|---|---|
| `this` | the source: the spell, the permanent, the token |
| `attached` | what the source is attached to ("enchanted creature") |
| `target:N` | the Nth announced target |
| `bound:name` | what an earlier instruction bound with `as` ("that land", "that much") |
| `event:object`, `event:objects` | what the triggering event happened to ("that land", "those creatures") |
| `event:player`, `event:source` | who caused the event, and the spell or ability that did ("that player", ward's "that spell") |
| `{top: 1, of: "you"}` | the top card of a library |
| `you`, `opponent`, `each-player` | players relative to the source's controller |
| `controller:target:0`, `owner:this` | a player read off an object |

Refs inside a delayed or reflexive effect, other than `event:*`, are fixed when
that trigger is created. Warp's "exile it at the next end step" exiles that
permanent, not whatever `this` names later.

**Selectors** describe sets: what may be targeted, chosen, counted, affected, or
watched. Each field narrows, and a list matches any of its members.

| Field | Example |
|---|---|
| `name` | a printed name, for "named" and for plans |
| `zones` | default battlefield; `["graveyard"]` for "card in a graveyard" |
| `controller`, `owner` | `you`, `opponent`, `any`, or a bound player |
| `types`, `subtypes`, `supertypes` | "basic land card" is `supertypes: ["basic"], types: ["land"]` |
| `not` | "nonbasic", "noncreature" |
| `words` | "creature with flying" |
| `power`, `toughness` | "power 2 or less" is `power: {atMost: 2}` |
| `tapped`, `token`, `attacking`, `blocking` | |
| `other` | "another": not the source |
| `is` | exactly one ref |
| `attachedTo` | "Equipment attached to that creature" |
| `linked` | "exiled with this" |
| `targeting` | a spell on the stack whose targets match: "a spell that targets a creature you control" |

On the battlefield a selector reads derived characteristics. Elsewhere it reads
printed ones. A creature with "all creature types" matches any creature subtype,
so an animated Soulstone Sanctuary is a Lizard.

**Targets** are slots announced with the action (601.2c). A slot takes an
`object` selector, a `player` side, or both. "Any target" is both:
`{object: {types: ["creature", "planeswalker", "battle"]}, player: "any"}`.
`count` defaults to one and `upTo` allows zero (115.6).

## Numbers and conditions

An **amount** is worked out when it is read and never stored.

| Form | Card |
|---|---|
| a literal | Shock's 2 |
| `count` of a selector | Smaug's "number of Treasures you control" |
| `counters` of a kind on a ref | Mossborn Hydra's doubling |
| `power`, `toughness` of a ref, captured when applied (608.2h) | Mightform Harmonizer's "double the power" |
| `bound` | "that much", "that many" |
| `distinct: "card-types"` among a selector | Keen-Eyed Curator |
| `life` of a player | "if you have 10 or less life" |
| `history` this turn: `cast`, `attacked`, `life-lost`, `life-gained`, with `of` and `by` | Witchstalker Frenzy, Magebane Lizard, Hired Claw |
| `x` | the X announced for this spell or ability; a permanent remembers its X (107.3m) |
| `sum` | amounts added together: Calamitous Cave-In's Caves plus Cave cards |
| `negate` | an amount taken away |

`history` reads what the table recorded since the turn began.

A **condition** is an amount against `atLeast` or `atMost`, a `bound` name that
holds something, `is` a ref matching a selector, or `all`, `any`, `not` over
conditions. Kicker and warp need no condition: their procedure variants already
say what they do.

## Doing things

**Instructions** run in order as a spell or ability resolves (608.2c). Any
instruction can carry `if` (do it only when the condition holds), `as` (bind
what it did, for a later instruction), and `may` (its actor chooses whether).

| Instruction | What it does |
|---|---|
| `damage` | `to` an object or player, `amount`, `from` (default the source) |
| `fight` | two creatures deal damage equal to their power to each other in one group (701.14) |
| `move` | `what` or `every`, `to` a zone, `position`, `tapped`, `counters`, `controller`, `reason`, `link` |
| `destroy` | moves to the graveyard; indestructible refuses it |
| `choose` | `who` picks `count` from a selector, `upTo` for "up to", `reveal` to show it to everyone |
| `shuffle`, `draw`, `mill` | |
| `counters` | `on` or `every`, `kind`, `amount`; a negative amount removes |
| `life` | gain or lose |
| `mana` | `colors` or `any`, `times` to repeat, `spendOnly` |
| `tap`, `untap` | |
| `token` | `count` of a `spec`: name, types, subtypes, colors, P/T, words, registrations |
| `modify` | change characteristics `until` a duration, written as a public label |
| `permit` | a player may play a card, `from` now or next turn, `until` a duration |
| `register` | add a registration to an object |
| `delay` | a delayed trigger: an event and an effect, once unless `until` gives it a span (603.7) |
| `reflect` | "when you do": a reflexive trigger with its intervening `check` (603.12) |
| `attach` | an Aura or Equipment to an object |
| `counter` | a spell or ability, `unless` a player pays a cost |
| `each` | repeat for each player, with `bound:player` |

Searching a library is `choose` from the library, then `move`, then `shuffle`.
Beholding is `choose` from the battlefield or hand with `reveal`. There is no
search or behold instruction, because hands do neither: they look, pick, move.

**Modifications** change characteristics and are applied by the layer walk
(613). `types` and `subtypes` are set or added, and `of` says whose subtypes are
set. `base` sets P/T (7b), `power` and `toughness` add to it (7c), `words` adds
keywords and restriction words, `registers` grants abilities, `loseAbilities`
removes them. A modification from a resolving effect locks the set it affects
when it begins (611.2c). A continuous registration re-reads its selector every
time.

Durations are `end-of-turn`, `end-of-combat`, `while-source` (as long as the
source stays), and `indefinite` (until the affected object leaves).

## Announcing

A **procedure** is one announced action, the unit a plan prepares.

| Field | Meaning |
|---|---|
| `source` | the card or permanent, by name and zone, or by ref |
| `claim` | what the seat says it is doing |
| `basis` | the card text it carries out, quoted |
| `timing` | `spell`, `land`, `stack` (an activated ability) or `mana` |
| `speed` | an activation's "only as a sorcery", or `instant` on a spell to claim its flash |
| `cost` | `mana` (with `{X}` announced as you cast), `tap` (the source, or chosen creatures such as crew's), `sacrifice`, `exile`, `life`, `discard`, `counters`, and a computed `reduce` |
| `if`, `limit` | when the seat may announce it, and "once each turn" |
| `targets` | its target slots |
| `instructions` | what happens when it resolves |
| `words` | restriction words on the spell itself, such as "can't be countered" |

A spell with no `cost.mana` pays its printed cost. Its timing comes from its
printed type line: a non-instant spell waits for a main phase and an empty
stack, unless its procedure claims flash with `speed: "instant"` or a permanent
registered flash for it.

Modes, kicker and warp are separate procedures. Abrade's two modes are two
procedures with different claims and targets. A kicked Burst Lightning is a
procedure with `cost.mana` "{4}{R}" and 4 damage. "Choose one" is which
procedure the seat announces, so there is no mode syntax.

Instructions on a permanent spell run after it enters, and `this` is then the
permanent. That is where warp's delayed exile and an Aura's `attach` go.

## Registering

A **registration** is a public note on an object. It lives while that object
exists, or until its own end. Every registration quotes the text it carries out
in `basis`, so another seat or a judge can check it. Registrations are how a
permanent "evaluates" things while it sits on the battlefield.

The seat that plays a card is responsible for registering it faithfully. The
table refuses a package whose `basis` is not that card's own text word for word
(line breaks, reminder text, dashes and case aside). Separate quotes can be
joined with literal ` ... `; every part must appear on the card. A card registers only
abilities it has. Whether a registration does what its quote says is not
checked by the table; the opponent sees both, and objects when they differ.

| Kind | What it is | Rule |
|---|---|---|
| `watch` | a triggered ability: an event, an intervening `if`, an effect, `may`, `limit` | 603 |
| `continuous` | a static ability: what it affects, the change, an `if` | 604, 611.3 |
| `enters` | how a permanent enters: tapped, with counters, under a condition; with `affects`, how others enter | 614.1c-d |
| `replace` | "if it would die, exile it instead" | 614 |
| `mana` | a mana ability, used while paying | 605, 601.2g |
| `permit` | an extra land play, lands from another zone, flash | 305.2 |
| `suppress` | events that don't cause triggers | Torpor Orb |

Keywords are `continuous` registrations with `words` on the object itself.

**Events** are what the table records: `enters`, `leaves`, `dies`, `attacks`,
`attacked-with` (a player attacked with one or more), `blocks`, `cast`,
`targeted`, `combat-damage`, and `step` beginnings. `of` selects what it
happened to, `by` who did it, `from` and `to` the zones, `step` and `whose` the
step, `player` combat damage to a player, and `batch` one trigger for "one or
more".

**Packages.** Before play, the model assesses each registered card with rules
text. A package holds `card`, `registers`, reusable `procedures` and `assessed:
true`. It covers normal and alternative casts, activated abilities, keywords,
triggers, static effects, replacements and entry behavior. The table never
interprets Oracle prose. Missing source paragraphs stop setup; source coverage
and schema validation do not prove that the model interpreted the card correctly.

- The table attaches registrations however the permanent enters: cast, played,
  put onto the battlefield by an effect. Assessed procedures are offered at
  priority with their source, timing, payment and target checks.
- Attaching is part of the entering motion. Its own `enters` registration
  applies as it enters (614.12). The applied package is frozen into the ledger
  row that caused the entry. Replay restores private work at its original
  decision boundary and applies those frozen registrations.
- The attachment is public and open to objection.
- The model adapter refuses to start or resume play with missing assessments.
  Low-level tables can still accept partial packages and show an entry warning;
  those are useful for isolated mechanics tests, not evidence of a prepared game.
- Packages survive turn-plan replacement. Corrections must retain complete
  source coverage. Changing a future package does not rewrite an existing
  permanent's registrations or an already announced spell.
- Tokens carry their registrations in their spec.

## Plans

A **plan** is what jev flies.

- `objective` and `guidance`: what this stretch is for.
- `steps`: the line, in order. Each option has a label, a window (`when`), an
  optional `if`, and an action: a listed table option by id, prefix or objects,
  or a procedure to announce. Optional `purpose` carries the intended later
  resolution choice, such as which basic land to find. It authorizes no automatic
  action. The announcing seat's purpose survives later plan changes.
- `may`: standing alternatives jev may take without asking when their window and
  `if` hold. "If they Shock my Chocobo, Veil it."
- `askWhen`: visible facts that mean the plan no longer fits, as conditions,
  each with an optional `when` window. A stop fires when its fact becomes true;
  the table then asks strategy for a new plan, at most twice a turn.
- `holds`: resources kept for a purpose (`objects`, `purpose`, an optional
  `releaseWhen`). An option that spends one is marked, never removed.
- `packages`: corrections to the seat's prepared registrations and procedures.

`docs/PLANS.md` says how the table flies a plan.

## Options the table lists

A plan points at the table's own options by id prefix and objects, so it never
needs an object id in advance.

| Id | Option |
|---|---|
| `pass` | pass priority |
| `land:<object>` | play a land |
| `cast:...` | cast a spell using its assessed procedure; the suffix names the source, payment and targets |
| `use:...` | activate an assessed procedure |
| `attack:<object>`, `attack:done` | add an attacker; finish declaring |
| `block:<blocker>:<attacker>`, `block:done` | add a block; finish declaring |
| `trigger:<id>` | put that waiting trigger on the stack next, with its targets |
| `play:<object>` | cast a card from another zone a `permit` allows |

A land a permission lets you play from another zone is a `land:` option too,
labelled with its zone.

A procedure option is the procedure itself, offered with each legal source,
target and payment.

## Execution semantics

Each of these is a small position from the matchup with the expected events and
state. They become the test positions.

**Combat declarations (508, 509).** Green declares Sazh's Chocobo, then Mossborn
Hydra, then done. Nothing has moved until done. Then one group taps both and
records both as attacking. Only then does any "whenever this attacks" watch
trigger, once per attacker. Hired Claw's `attacked-with` Lizards fires once for
the group however many Lizards attacked.

**Trigger detection (603.6, 603.10).** Earthbender Ascension resolves and enters.
`enters` watches read the battlefield after the group, newcomers included, so
Ascension's own "when this enters" triggers (603.6a). Its search later puts a
Forest onto the battlefield, and that group triggers both Ascension's landfall and
Sazh's Chocobo's. `leaves` and `dies` watches, sacrifice watches and earthbend's
"when it dies" read `receipt.before`, so a watch on the object that left still
fires.

**Layers (613).** Mossborn Hydra (printed 0/0) enters with a +1/+1 counter. A
land enters: the doubling watch resolves, two counters. Mightform Harmonizer
targets it: power captured as 2, a 7c effect of +2/+0 until end of turn. Snakeskin
Veil adds a third counter. Reading it: printed 0/0, nothing in 7b, then in 7c
the three counters (+3/+3) and the +2/+0, giving 5/3. Nothing is stored; at
cleanup the +2/+0 ends and it reads 3/3. Effects apply by layer, sublayer and
timestamp, with dependency (613.8) first, across every origin.

**Targets (608.2b).** Fiery Annihilation targets a creature and an Equipment
attached to it. If the Equipment leaves, the damage still resolves on the
creature and the exile instruction does nothing. If both are illegal, nothing
resolves and the spell goes to the graveyard.

**Fight (701.14).** Meltstrider's Resolve enters on Chocobo (power 2) and fights
a 1/2 Hired Claw. One damage group: Chocobo deals 2, Claw deals 1, both read
power as the fight happens. If either has left, neither deals damage.

**Lifetimes (603.7c, 603.10a).** Earthbend targeting Ba Sing Se itself: the delayed
"when it dies, return it" belongs to the table, refers to that land's incarnation,
and fires when it dies even though its source is gone. Ghost Vacuum sacrificed as
part of its cost keeps "the cards exiled with it", because the linked set is bound
when the ability is announced.

## Labels

Counters and marked damage are physical. Anything else a player tracks beside a
card is a public label with text and a lifetime: "power doubled until end of
turn", "warped: exile at the next end step", "earthbent: returns when it dies".
A player puts labels on its own objects and keeps them current.

Labels and `modify` are one bucket. `modify` writes a label on each object it
affects, with the claim as its text unless `label` gives one. A label with a
`change` is applied by the layer walk; a label without one is information for the
players and the judge. Every view shows every label, and each ends by its
lifetime.

## Rollback

A judge's ruling that an action was wrong is settled by a rollback, which is an
ordinary event in the game:

1. The rollback is declared with the case, the contested action, the point just
   before it, and the reasoning. It is recorded in the journal and every seat
   sees it.
2. The table returns to that point. What each seat saw stays seen: the rollback
   note records it.
3. Every seat plans again from the restored position. The judge decides the
   remedy; players are not asked to approve it.

There is no other remedy machinery.

## How far a plan reaches

One strategy session per turn, plus escalations. Jev does the work in between,
and an escalation is the fix when the plan stops fitting.

## How the syntax grows

A shape is added when a card needs it. Coverage grows by reviewing cards that
need real support and checking each one against the syntax, not by adding
shapes in advance. Revealing a hand for another seat to choose from is the next
likely addition; no card in the matchup needs it yet.

## Not expressible yet

- Dungeons. No Standard card ventures today.
- Revealing a hand for another seat to choose from.
- Replacement ordering when two replacements change where something goes. None
  of these cards produce it.
- Copies, effects that take control of a permanent, and face-down permanents.
  None of these cards produce them.
- Casting the back half of a split, adventure or Omen card: the table reads the
  front face.
- Hybrid and Phyrexian mana symbols. The printed cost reader and a stated cost
  both accept generic, colored and X symbols only.
