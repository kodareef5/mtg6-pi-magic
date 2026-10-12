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

The table acts on the keywords its combat and layer code read: first strike,
double strike, trample, vigilance, haste, indestructible and deathtouch. Flying,
reach, menace, hexproof and the "can't block" family mark options without hiding
any. Any other lowercase word is recorded for the players and the judge.

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
| `event:recipient` | the permanent dealt damage, when the matched event has one shared recipient |
| `{top: 1, of: "you"}` | the top card of each named library; `top` accepts a computed amount and `of` may name each-player |
| `{exceptBottom: 6, of: "each-player"}` | all but the bottom six of each library, combined before simultaneous motion; it grants no look |
| `you` (or `self`), `opponent`, `each-player` | players relative to the source's controller |
| `controller:target:0`, `owner:this` | a player read off an object |

Information readers retain a departed target's last controller, owner and
characteristics. Preserve printed instruction order: exile first, then read
`controller:target:0` for life loss. A physical instruction still requires the
live incarnation, and an illegal target supplies neither motion nor information.

Refs inside a delayed or reflexive effect, other than `event:*`, are fixed when
that trigger is created. Warp's "exile it at the next end step" exiles that
permanent, not whatever `this` names later.

**Selectors** describe sets: what may be targeted, chosen, counted, affected, or
watched. Each field narrows, and a list matches any of its members.

| Field | Example |
|---|---|
| `name` | a printed name, for "named" and for plans |
| `zones` | default battlefield; `["graveyard"]` for "card in a graveyard" |
| `controller`, `owner` | `you` (or `self`), `opponent`, `any`, or a bound player |
| `types`, `subtypes`, `supertypes` | "basic land card" is `supertypes: ["basic"], types: ["land"]` |
| `not` | "nonbasic", "noncreature" |
| `any`, `all` | match any branch or every branch; other fields still narrow, and branches inherit an outer `zones` |
| `colors` | `["R", "G"]` means red or green; `[]` means colorless; `not.colors` excludes the same set |
| `words` | "creature with flying" |
| `power`, `toughness`, `manaValue` | `manaValue: {atMost: 3}`; bounds may also be amounts, such as `{atMost: {x: true}}` |
| `hasAdventure` | whether the visible object has Adventure characteristics, including when its normal face is active (715.2a) |
| `designations` | every named physical designation must be present; currently `harnessed` (701.64) |
| `subtypes.chosen` | read the source's named entry choice; a missing choice matches nothing; mana freezes it when produced |
| `tapped`, `token`, `attacking`, `blocking` | |
| `blocked` | true selects blocked attackers; false selects unblocked attackers, after the blocker declaration; a departed blocker does not change that status |
| `other` | "another": not the source |
| `is`, `not.is` | include or exclude the objects a ref names, including a bound set |
| `attachedTo` | "Equipment attached to that creature" |
| `linked` | "exiled with this" |
| `targeting` | a spell on the stack whose targets match: "a spell that targets a creature you control" |

On the battlefield a selector reads derived characteristics. Elsewhere it reads
printed ones. A creature with "all creature types" matches any creature subtype,
so an animated Soulstone Sanctuary is a Lizard.
An `any` can join different zones, such as another battlefield creature or a
spell on the stack. Without an outer `zones`, each branch defaults to battlefield
unless it states its own zone. An `all` of land and creature predicates matches
only objects with both types. A union returns each object once.
Mana value reads the selected face and includes announced X only on the stack
(202.3). An additional cost or reduction changes payment, not mana value. A
transforming back uses its front cost; a Room uses its unlocked doors on the
battlefield. A hidden card matches no color or mana-value predicate. Payment
does not change these characteristics.

**Targets** are slots announced with the action (601.2c). A slot takes an
`object` selector, a `player` side, or both. "Any target" is both:
`{object: {types: ["creature", "planeswalker", "battle"]}, player: "any"}`.
`count` defaults to one and `upTo` allows zero (115.6). `count: 2, atLeast: 1`
means one or two distinct targets in one slot. A positive `atLeast` cannot
exceed `count` or combine with `upTo`. `target:0` names every member of slot
zero. Apply a single printed instruction to that whole slot: damage or movement
to two targets happens in one committed group. Separate slots can name the same
object when the card has separate occurrences of "target" (115.3).

`count: "any"` allows any number of distinct targets, including zero. With
`divide: Amount`, the seat assigns the total among its targets before costs;
every chosen target must receive a positive integer (601.2d). A zero total
requires zero targets. Damage and counter instructions read each recipient's
recorded share through `amount: {divided: N}`. Lost targets never redistribute
their shares. [Grove's Bounty](examples/divided-targets.md) exercises X,
target selection, announced allocation and the ordinary Adventure departure.

## Numbers and conditions

The condition `{ "step": "declare-blockers" }` reads the current rules step.
Combine it with `{ "turn": "self" }` for a restriction to your own step.

An **amount** is worked out when it is read and never stored.

| Form | Card |
|---|---|
| a literal | Shock's 2 |
| `count` of a selector | Smaug's "number of Treasures you control" |
| `aggregate: "max"`, `"min"` or `"sum"`, with `of` and `value` | Sunderflock's greatest mana value among controlled Elementals; reads current characteristics and yields zero for an empty set |
| `counters` of a kind on a ref | Mossborn Hydra's doubling |
| `power`, `toughness` of a ref, captured when applied (608.2h) | Mightform Harmonizer's "double the power" |
| `manaValue` of a ref | Thor's damage from `event:object`; a departed spell keeps its last stack value, including X |
| `bound` | "that much", "that many" |
| `manaSpent` | actual mana spent to cast the referenced spell or the permanent it became; optional `color` counts one mana type |
| `colorsSpent` | distinct colors spent on that cast; colorless mana adds no color |
| `distinct: "card-types"` among a selector | Keen-Eyed Curator |
| `speed` of a player | Perilous Snare; reads zero before speed starts |
| `life` of a player | "if you have 10 or less life" |
| `startingLife` of a player | the format's starting life total, independent of current life |
| `{event: "amount"}` | damage dealt in the matched event, including simultaneous sources or recipients |
| `{resolution: true}` | this ability's current resolution number this turn, starting at one; Belladonna Took's first, second and third effects |
| `half` of an amount, with `round: "up"` or `"down"` | Cecil's comparison with half starting life |
| `history` this turn: `cast`, `attacked`, `life-lost`, `life-gained`, with `of` and `by` | Witchstalker Frenzy, Magebane Lizard, Hired Claw |
| `x` | the X announced for this spell or ability; a permanent remembers its X (107.3m) |
| `sum` | amounts added together: Calamitous Cave-In's Caves plus Cave cards |
| `negate` | an amount taken away |
| `turns` of `self` or `opponent` | how many turns that side has begun, the current one included: Starting Town's "your first, second, or third turn" |

`history` reads what the table recorded since the turn began.
`resolution` reads completed resolutions of the same source incarnation and
source quotation, plus the current one. It stays constant across that program's
instructions. Countered abilities and abilities that fail their target or
intervening-if check do not count. Outside an ability's resolution it is zero.
See [resolution counts](examples/resolution-counts.md) for the accepted scope.

A **condition** is an amount against `atLeast` or `atMost`, a `bound` name that
holds something, `is` a ref matching a selector, `turn` naming whose turn it is
(`self` or `opponent`: Eddymurk Crab's "if it's not your turn"), or `all`,
`any`, `not` over conditions. `{cast: "this", by: "you"}` asks whether that
object was cast by that player, with optional `from` for the casting zone.
Casting facts follow a resolving spell onto the battlefield, including its X
and actual payment. A blink or reanimation starts a new object with no cast;
amounts for an uncast object are zero. A reduction, alternative price or free
cast therefore changes the payment query without changing the printed cost.
Kicker and warp need no condition: their procedure variants already
say what they do.

## Doing things

**Instructions** run in order as a spell or ability resolves (608.2c). Any
instruction can carry `if` (do it only when the condition holds), `as` (bind
what it did, for a later instruction), and `may` (its actor chooses whether).

| Instruction | What it does |
|---|---|
| `increase-speed` | `who`, positive integer `amount`; sets absent speed to that value or increases existing speed (702.179c) |
| `damage` | `to` an object or player, `amount`, `from` (default the source); `as` binds recipients dealt positive damage and their total after prevention |
| `damage-rule` | global all-damage prevention or prohibition (`mode: "prevent"` or `"unpreventable"`), optionally `combat`, lasting until `until`; no bounded shield or additional prevention effects |
| `fight` | two creatures deal damage equal to their power to each other in one group (701.14) |
| `move` | `what` or `every`, `to` a zone, `position`, `tapped`, `counters`, `controller`, `reason`, `link`, `face` for entry transformed |
| `destroy` | moves to the graveyard; indestructible refuses it |
| `choose` | `who` picks `count` from a selector, `upTo` for "up to", `reveal` to show it to everyone; another hand needs an earlier explicit look, and a library search must name its owner or controller, or a bound inspected subset |
| `reveal` | publicly reveal `what` or `every` without moving it; optional `as` binds the revealed cards for a later selection; confirmation contains no hidden names |
| `name-card` | `who` chooses an Oracle card name, optionally filtered by printed `types`; remember it as `key` on the current incarnation of `on` |
| `look` | `who` privately inspects `what` or `every`; `as` binds exactly that window for later selection |
| `order` | `who` places a library subset (`what` or `every`) at `position` (`top` or `bottom`), choosing its order unless `random: true` |
| `keyword` | `name` scry or surveil, `who`, `count`; one player's private choices followed by a completion event; `as` binds cards actually put away |
| `activation-timing` | `who`, `ability: "loyalty"`, source selector `of`, and `until`; permits instant-speed loyalty activation, retaining priority, costs and each permanent's turn allowance |
| `spell-words` | grants `words` to future spells cast by `who`, optionally filtered by `of`; `next: true` is consumed by the first match, and unused effects expire at `until` |
| `pay` | `who` pays every part of `cost` together; `may` allows declining, and `as` binds success for a later `if` |
| `perform` | `who` accepts an ordered `instructions` group in the current resolution; `may` offers declining the whole group; `as` binds acceptance independently of any cards selected inside |
| `shuffle`, `draw`, `mill` | |
| `counters` | `on` or `every`, `kind`, `amount`; a negative amount removes |
| `life` | gain or lose |
| `mana` | `colors` or `any`, optional `combination` for mixed colors, `times`, `spendOnly`; `spendFrom` limits original casting zones; optional `until` end of combat or end of turn; `spellWords` granted only to the spell it pays for |
| `tap`, `untap` | |
| `transform` | `what` or `every`; keep the same permanent and turn it to its other face |
| `door` | `what`, `action` unlock or lock, optional `face`; otherwise the player chooses an eligible door |
| `prepare` | `what`, `prepared` true or false; preparing creates its castable copy in exile |
| `designate` | `what`, `designation: "harnessed"`; marks the current permanent until it leaves the battlefield |
| `token` | `count` of a `spec`: name, types, subtypes, colors, P/T, starting `loyalty`, words, registrations; optional `controller` names each creator (default `you`); `tapped` and `attacking`, with each entering attack's defender chosen before the group enters |
| `modify` | change characteristics `until` a duration, written as a public label |
| `permit` | a player may play a card; `who: "owner"` grants each affected card's owner permission for that card; `from` now or next turn, `until` a duration; optional `mana` grants casting at that alternative price only; `while` rechecks a live condition on each use |
| `register` | add a registration to an object |
| `delay` | a delayed trigger: an event and an effect, once unless `until` gives it a span (603.7) |
| `reflect` | "when you do": a reflexive trigger with its intervening `check` (603.12) |
| `attach` | an Aura or Equipment to an object |
| `counter` | a spell or ability, `unless` a player pays a cost; `to: "exile"` replaces the countered spell's graveyard destination, without an intermediate move; no `as` binding |
| `each` | repeat for each player, with `bound:player` |

Searching a library is `choose` from the library, then `move`, then `shuffle`.
Name the library's owner or controller explicitly. Equipment validation refuses
an explicit library selection without that scope or an inspected binding;
resolution also checks visibility before showing any options. Put an optional search's
whole sequence inside `perform` with `may`, so accepting and finding nothing
still shuffles but declining does not. See [optional search](examples/optional-search.md).
Beholding is `choose` from the battlefield or hand with `reveal`. There is no
search or behold instruction, because hands do neither: they look, pick, move.

Naming a card is a different choice from selecting a card object. `name-card`
reads the journal's pinned Oracle catalog, including individual faces and
names outside the format. `name: {chosen: "key"}` in a selector reads its
source's remembered choice and matches nothing before that choice resolves.
The choice expires when that incarnation leaves its zone. See
[card names](examples/card-names.md). Name qualifications beyond printed card
types remain unsupported.

**Modifications** change characteristics and are applied by the layer walk
(613). `types` and `subtypes` are set or added, and `of` says whose subtypes are
set. `colors.set` replaces colors and `colors.add` adds them in layer 5;
`colors.set: []` makes an object colorless. `base` sets P/T (7b), `power` and `toughness` add to it (7c), `words` adds
keywords and restriction words, `registers` grants abilities, `loseAbilities`
removes them. A modification from a resolving effect locks the set it affects
when it begins (611.2c). A continuous registration re-reads its selector every
time.

Durations are `end-of-turn`, `end-of-combat`, `while-source` (as long as the
source stays), and `indefinite` (until the affected object leaves).
Permissions also accept `until: {endOfNextTurn: "you"}` (or another player
reference). This expires during cleanup of that player's next turn after the
permission was made. `from: "next-turn"` instead means after the current table
turn, as warp requires. See [casting permissions](examples/casting-permissions.md).

A permission's `mana` replaces the mana cost, never timing or additional
costs. It gives no land play or printed-price cast. Other permissions keep
their own choices. A separately priced procedure, such as warp, cannot combine
its price with a permission's price. `cost.additional` adds named mana costs
after that price is chosen, before reductions. Do not fold kicker into
`cost.mana`: that states an alternative price. `owner:bound:name` reads the
owner of an earlier bound object.

Mana normally empties at every step end. `until: "end-of-combat"` retains it
through combat steps and removes it as the end of combat step ends;
`until: "end-of-turn"` removes it as cleanup ends. Cleanup also removes combat
mana if that combat ending was skipped. Mana registrations accept the same
duration. Payments keep otherwise identical mana with different expiry as
separate choices, and resource forecasts respect the stated step boundaries.

## Announcing

A **procedure** is one announced action, the unit a plan prepares.

| Field | Meaning |
|---|---|
| `source` | the card or permanent, by name and zone, or by ref; `registered` requires the exact basis of a currently active `activated` registration |
| `claim` | what the seat says it is doing |
| `basis` | the card text it carries out, quoted |
| `timing` | `spell`, `land`, `stack` (an activated ability), `mana` or `special` |
| `special` | `plot` exiles a hand card; `turn-face-up` pays a manifested creature card's cost at priority. Both use staged payment without the stack |
| `speed` | an activation's "only as a sorcery", or `instant` on a spell to claim its flash |
| `cost` | `mana` (with `{X}` announced as you cast), `tap` (the source, or chosen creatures such as crew's), `sacrifice`, `return` to owners' hands, `exile`, `life`, `discard`, `counters`, signed `loyalty`, `show`, and a computed `reduce` |
| `if`, `limit` | when the seat may announce it, and "once each turn" |
| `targets` | its target slots |
| `instructions` | what happens when it resolves |
| `words` | restriction words on the spell itself, such as "can't be countered" |

A spell with no `cost.mana` pays its printed cost. Its timing comes from its
printed type line: a non-instant spell waits for a main phase and an empty
stack, unless its procedure claims flash with `speed: "instant"` or a permanent
registered flash for it.

Plot uses `timing: "special"`, `special: "plot"`, a hand source and fixed
`cost.mana`, with empty instructions. Its staged payment exiles the card and
records its owner's later-turn casting permission. The later cast costs {0},
retains additional costs and requires the owner's main phase with an empty
stack even with flash. The permission belongs to that exiled incarnation;
plotting is neither a cast nor an activated ability. Other plotting zones
and nonmana costs remain unsupported. A `cost` registration with `action: "plot"`
reduces its generic mana while selecting the hand card. See [Plot](examples/plot.md).

Modes, kicker and warp are separate procedures. Abrade's two modes are two
procedures with different claims and targets. A kicked Burst Lightning is a
procedure with `cost.additional: [{name: "kicker", mana: "{4}"}]` and 4 damage. "Choose one" is which
procedure the seat announces, so there is no mode syntax.

Named additional mana payments belong to spell announcements. Each instance
has a distinct name; `{cast: "this", paid: "offspring"}` reads whether that
instance was paid for the spell or the permanent it resolved into. Reducing
the total cost to zero still pays the chosen additional cost. A blink or a
token copy inherits no casting payment. See [named costs](examples/named-costs.md).

Optional additional costs also use separate procedures. A blighted Requiting
Hex pays its counter at announcement and includes the life gain in that variant;
the unpaid variant does neither. `cost.counters` removes `count` of `kind` from
the source by default. `on: {choose, count}` instead selects distinct controlled
permanents, and `put: true` puts counters as payment, such as blight.
`cost.show: {choose, count}` selects controlled battlefield objects or cards in
the payer's hand; only the hand cards are revealed. A behold variant selects
Dragons in those two zones and fixes its stronger effect when announced.
Neither cost waits for resolution. A resolving `pay` uses these same costs and
binds success only when every part is paid. See [payment examples](examples/payments.md).

A loyalty-symbol activation uses `cost.loyalty`, a signed integer: positive
adds counters, negative removes them, and zero still uses the permanent's one
loyalty activation for that turn. It requires the controller's main phase and
an empty stack unless an `activation-timing` permission applies. The turn
allowance is shared across abilities and players for the same incarnation.
Combine loyalty adjustments into this one cost; a separate
`counters` payment does not express loyalty timing. Printed starting loyalty
and a token's `spec.loyalty` supply entry counters. See [loyalty](examples/loyalty.md).

Instructions on a permanent spell run after it enters, and `this` is then the
permanent. That is where warp's delayed exile and an Aura's `attach` go.

## Registering

Token creation accepts either `spec` or `copy`, never both. `copy` freezes a
single permanent's copiable base terms and complete battlefield activations;
it does not copy current counters or temporary changes. With `copy`, an optional
`except: {power: 1, toughness: 1}` replaces those copiable base values. Sources
with continuous base-setting abilities remain unsupported for that exception.
See
[token copies](examples/token-copies.md) for supported sources and entry behavior.

Counter watches use `on: "counters"`, optional `counter` for the kind and
`reaches` for crossing an Nth-counter threshold, including entry counters.
See [counter watches](examples/counter-watches.md) for batching and actor limits.

A standing watch's `effect.modes` offers one mode before its controller puts the
trigger on the stack. `event.ordinal` selects a numbered spell cast by that
caster this turn, independently of a later resolution-time condition. See
[modal triggers](examples/modal-triggers.md) for target scope and limits.

A **registration** is a public note on an object. It lives while that object
exists, or until its own end. Every registration quotes the text it carries out
in `basis`, so another seat or a judge can check it. Registrations are how a
permanent "evaluates" things while it sits on the battlefield.

The seat that plays a card is responsible for registering it faithfully. The
table refuses a package whose `basis` is not that card's own text word for word
(line breaks, reminder text, dashes and case aside). Separate quotes can be
joined with literal ` ... `; each part consists of complete sentences or printed
lines in source order. A word or a cost symbol alone does not quote its sentence.
Complete keyword lines can be short. A card registers only
abilities it has. Whether a registration does what its quote says is not
checked by the table; the opponent sees both, and objects when they differ.

| Kind | What it is | Rule |
|---|---|---|
| `watch` | a triggered ability: an event, an intervening `if`, an effect, `may`, `limit` | 603 |
| `continuous` | a static ability: what it affects, the change, an `if` | 604, 611.3 |
| `cost` | a standing generic reduction: `action` defaults to `cast`, where `cast` selects the proposed stack spell; `action: "plot"` selects the hand card. Positive `reduce` gives the discount, optional `from` limits its original zone, and `if` tests the source's condition | 118.7a, 118.9d, 601.2f, 702.170 |
| `enters` | how a permanent enters: tapped, with counters, under a condition; with `affects`, how others enter; `unlessPay: {life}` or `{show: {choose, count}}` asks the controller to pay or decline; `copy: {of, may?, add?}` chooses a battlefield copy source for this permanent before entry, with additive creature types and abilities | 614.1c-d, 707.5 |
| `replace` | "if it would die, exile it instead" | 614 |
| `mana` | a mana ability, used while paying; `if` holds a condition the ability needs, as a Verge's "Activate only if you control an Island or a Swamp" | 605, 601.2g |
| `activated` | a complete ability carried by a permanent: `cost`, `effect`, optional `speed: "sorcery"`, `if` and `limit`; offered through normal stack procedures while the registration remains active | 602, 606 |
| `permit` | an extra land play, lands from another zone, flash; `cast: {from, mana, leavesStack?}` grants this card's owner an alternative cast from the named zones | 305.2, 702.180 |
| `prohibit` | `cast` names players who cannot cast, with optional `during`; `activate` selects sources whose abilities cannot be activated, with optional `exceptMana: true`; these shapes accept `if`. `block: {attacker, blocker}` names two selectors whose matching pair cannot block | 101.2, 509.1b |
| `suppress` | events that don't cause triggers | Torpor Orb |

Keywords are `continuous` registrations with `words` on the object itself.
Casting restrictions use `prohibit`, evaluated from the active registrations
and current turn. They apply to casts from every permitted zone. Losing
abilities removes the restriction through the layers. `prohibit.activate`
defaults to sources in any zone, unless its selector narrows the zones. It
checks both listed activations and mana abilities used during payment. The
`exceptMana` exception preserves both registered and intrinsic mana abilities.
Neither shape hides required interpretation work. These restrictions do not
express spell-count limits or restrictions on particular spell types, or
distinguish individual non-mana abilities on the same source.

`prohibit.block` reads both selectors against the registration's source and
current characteristics. It marks a conflicting block while leaving the physical
choice available, and supplies the same conflict to strategy and declaration
review. It cannot express requirements on an entire blocking group. See
[blocking restrictions](examples/block-restrictions.md) for a strict power comparison.

A native `permit.cast` is read from the card's accepted standing terms in its
stated zone. It activates readiness before affordability or timing, then
supplies the price and any departure replacement to the usual casting path.
A deferred source zone alone grants no casting permission. This registration
does not express mandatory nonmana permission costs. Harmonize's optional tap
is a cost variant: `tap: {choose: {types: ["creature"], controller: "you"},
count: 1, upTo: true, reduce: "power"}` reserves zero or one untapped creature
and reduces only generic mana by its current power. The reduction never goes
below zero; the tap needs no tap-symbol ability or freedom from summoning
sickness. See `native-casting.md` for complete discard branches and casting
terms. Syntax acceptance still does not certify the source interpretation.

**Events** are what the table records: `enters`, `leaves`, `dies`, `attacks`,
`attacked-with` (a player attacked with one or more), `blocks`, `cast`,
`targeted`, `damage`, `combat-damage`, and `step` beginnings. `of` selects what it
happened to, `by` who did it, `from` and `to` the zones, `step` and `whose` the
step, `player` combat damage to a player, and `batch` one trigger for "one or
more". Damage watches optionally filter `combat: true` or `false`. They group
by source, or by recipient with `received: true`; `of` selects that object and
`{event: "amount"}` sums its matched damage. `player` can also name a side.
See [damage](examples/damage.md) for simultaneous events and last known sources.

An `is`/`matches` condition normally requires a live incarnation. Add
`lastKnown: true` for an information check about that incarnation after it
left, such as Azog's conditional draw after destruction. This does not make
it movable or restore targets illegal at resolution. See [amass](examples/amass.md).

A `trigger-rule` registration adds `additional` instances of abilities that
a permanent matching `affects` has, including granted watches and chapters.
Counts add once; delayed and reflexive triggers receive none. Each instance
chooses its own mode and targets. Event-specific trigger restrictions are not
supported by this form. See [additional triggers](examples/additional-triggers.md).

A watch's `limit: "once-per-turn"` counts triggers. An optional watch with
`may: true` and `limit: "once-per-turn-use"` instead records acceptance during
resolution (603.2h). Declining and losing all targets spend nothing. The chosen
use stops pending copies and new triggers that turn; it survives source removal
and journal replay. This limits the whole effect, not an optional instruction
inside a larger effect. Condition bounds can read amounts too, including half
the controller's starting life.

**Packages.** Before play, the model assesses each registered card with rules
text. A package holds `card`, `registers`, reusable `procedures`, optional
`printedCast: true`, `deferred` uses, and `assessed: true`. It covers normal and alternative casts, activated abilities, keywords,
triggers, static effects, replacements and entry behavior. The table never
interprets Oracle prose. Missing source paragraphs stop setup; source coverage
and schema validation do not prove that the model interpreted the card correctly.

`printedCast: true` selects the shared ordinary permanent cast. The model uses
it only when paying the printed fixed mana cost is enough, with no targets,
additional costs, casting restrictions, spell properties or extra instructions.
Core checks the structured card type and cost, and the current zone permission.
It does not certify that the model's claim matches the rules text. Entry abilities
still come from registrations. Alternative costs remain separate procedures.
Set `printedCast: false` when a correction replaces that shared cast with a procedure.

Structured `faces` and `layout` come from the pinned card source. A multi-face
claim names `face: 0` or `face: 1` and quotes only that face. Procedures select
their spell face with `face`; battlefield activations use `source.face` to
require the active face or unlocked Room door. `printedFaces: [1]` accepts an
additional ordinary permanent face. The full registered name still identifies
one card through every zone change.

Adventure and Omen casts use the chosen face's cost, type, color and targets.
A resolving Adventure exiles the card and permits its controller to play only
the normal face from that exile incarnation (715.3d). A resolving Omen shuffles
the card into its owner's library (720.3d). Countering either spell, or making
all its targets illegal, sends it to the graveyard without that continuation.
These shared rules supply no printed spell instructions.

Rooms retain unlocked designations while on the battlefield. The table offers
paying a locked door's printed cost as a special action in its controller's
empty-stack main phase (709.5). Watches use `on: "unlocks"`, optional `face`,
and optional `fully: true`. Transformation watches use `on: "transforms"`.

Craft composes a source exile, a material choice and entry transformed.
For a payment by total mana value, `cost.exile` can instead be
`{graveyard: {}, totalManaValue: 6}`. The filter narrows the payer's graveyard.
Selection precedes spending; confirmation pays the full cost in one group.
Every eligible subset remains reachable, including extras after the threshold.
See [payments](examples/payments.md).

`cost.exile` can be `{choose, count, source: true}`. The choice selects controlled
battlefield objects or owned graveyard cards; `source: true` also exiles the
source and binds its new incarnation as `bound:cost-source`. Exiling `"this"`
alone supplies the same binding. See [face examples](examples/faces.md).

A Saga registers each chapter with `kind: "chapter"`, `numbers` and `effect`.
The table supplies lore on entry and at the precombat main boundary, then
sacrifices the Saga after its final chapter and any other pending chapters
leave the stack (714). A finality counter changes that destination to exile.
The chapter's printed instructions still belong to the resolving seat.

`enters.prepared` prepares a permanent as it enters. `prepare` can later change
the designation. Its controller may cast the resulting copy from exile using
face 1; the source stays on the battlefield and becomes unprepared. The unused
copy ceases when the source leaves or becomes unprepared (722.3c).
This removes the repeated empty cast program.

`deferred` identifies a cast or nonmana activation by `claim`, its complete
source `basis`, a `source` query naming the card, zones and controller, and
`timing` (`spell` or `stack`). It supplies no executable effect. Standing
abilities, mana, entry behavior, replacements and triggers must be registered
before dealing. A delayed effect created by a use belongs to that procedure.

At priority, a deferred use whose source is visible and in its accepted scope
appears in `Decision.preparation`. Casting also requires permission to play
the card from that zone. This is a conservative readiness check: it does not
require affordable payment, legal targets or the right casting speed yet.
The seat supplies procedures through `package.put`, preserving standing terms
and clearing the corresponding deferred entries. No action or fallback pass
can proceed until that work is accepted. The model adapter asks its strategy
model to interpret the card in a separate call, before Jev's physical choice.
Its answer names each requested use by index and supplies the executable fields.
The adapter copies the accepted source, basis, timing and face into each
procedure; separate requested modes must each be answered even when they quote
the same source text. The journal stores the resulting complete procedures.
New games with that role off prepare complete uses in pregame instead.

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

- `objective` and `guidance`: audit rationale. The pilot does not read them as
  execution instructions. Strategy submissions no longer offer them; the
  writer's assessment fills them.
- `throughTurn`: the last table turn covered by the tactical plan. Context sets
  an own-turn plan to that turn plus the following opponent turn. Repairs keep
  its scope. Expiry includes holds and unbounded policies; it removes no equipment
  and changes no recorded work. Legacy plans without this field stay unbounded.
- `steps`: the line, in order. Each option has a label, a window (`when`), an
  optional `if`, and an action: a listed table option by id, prefix or objects,
  or a procedure to announce. Optional `purpose` supplies execution choices at
  announcement, target and payment inspection, and resolution, such as the target,
  payment preference or basic land to find. It authorizes no automatic action.
  The announcing seat's purpose survives later plan changes.
  Optional `waitFor: "empty-stack"` requires the whole stack to empty before
  that commitment. It displays waiting without removing options or granting a
  pass. An early choice still records the action taken. Absence adds no
  prerequisite: ordered steps order announcements, not completed resolutions.
  The field stays on retained steps after an amendment and is also available
  on `may` branches and current-response submissions.
- `may`: standing alternatives jev may take without asking when their window and
  `if` hold. "If they Shock my Chocobo, Veil it."
- `askWhen`: visible facts that mean the plan no longer fits, as conditions,
  each with an optional `when` window. A stop fires when its fact becomes true;
  the table then asks strategy for a new plan, at most twice a turn.
- `holds`: resources kept for a purpose (`objects`, `purpose`, an optional
  `releaseWhen`). An option that spends one is marked, never removed.
  Marks read payment, tapping and removal commitments, not every participant:
  targeting a held creature or attacking with vigilance does not spend it.
  A nonvigilant attack commits its tap when the declaration finishes.
- `packages`: corrections to the seat's prepared registrations and procedures.
- `triggers`: standing orders for the seat's own triggers that wait together,
  such as the landfall triggers of each land entry. `resolve` lists their
  sources by query in the order the triggers resolve, first first; an optional
  `when` limits the window and `targets` names, per source, the object it
  targets (a query) or `"opponent"` or `"self"`. Whenever two or more listed
  triggers wait, the options that put the last to resolve on now, aiming at any
  named target, are marked in placement order; a named target also marks a lone
  trigger. Marks never choose: the pilot still picks each put, and each put is a
  ledger row the opponent can object to. Without a plan order the pilot is asked,
  pair by pair, which trigger resolves first.
- `phases`: window policies for responses, triggers, searches and exceptions.
  Optional `complete: "ask"` tells the pilot, on its help option, to ask for a
  new plan once the window's commitments finish; `"pass"` adds nothing, since the
  pass option already says what passing does. Waiting for a stack
  object uses the response policy separately. Trigger and ordinary resolution
  read the phase policy in force at announcement, even after an amendment.

Fresh preparation uses the pregame playbook, accepted equipment and current
facts. It never re-dates prior tactical windows. Only amendments within the same
scope retain unfinished steps, branches and holds. A purpose that contradicts
a hold needs repair; context neither parses it nor invents precedence.

`docs/PLANS.md` says how the table flies a plan.

New strategy submissions require `atLeast` or `atMost` on every plan `amount`
condition, including nested stops and hold releases. An explicit zero is valid.
An omitted comparison is refused instead of silently making the condition
always true. Previously accepted journal terms keep their original semantics.

A turn or preparation submission requires `theirTurn: {guidance, complete}`,
which becomes a phase for the whole opponent turn (`when: {active: "opponent"}`).
Written phases require `complete`. A written phase replaces the inherited phase
with the same window and the others stay; `phases: []` over inherited phases is
refused. A stop that already holds where it is watched is refused, since it
would fire at once.

The strategy submission tool accepts two explicit window shorthands before
checking the canonical plan: `when.step: "any"` omits the step constraint, and
a phase name such as `when.step: "combat"` becomes `when.phase: "combat"`.
An explicit phase must agree; conflicting claims are refused. It also lifts
`atLeast` and `atMost` from inside a condition's `amount` when that bound is
absent outside it. A bound stated twice is refused. The journal stores the
canonical fields; replay does not reinterpret old answers.

## Options the table lists

A plan points at the table's own options by id prefix and objects, so it never
needs an object id in advance.
An `objects` query can narrow by `card`, `zones`, `controller`, `types`,
`tapped`, physical card `ids` and exact incarnation `refs`. An `ids` query names
an identified visible card across a future zone change, such as casting a card
then attacking with it. It does not promise that the entry succeeds or that the
card can attack. A `refs` query stops matching when the incarnation changes.
`types` matches any listed current type;
other fields narrow that match. It reads projected characteristics, including
type changes, and cannot discover the type of a hidden object.

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
shapes in advance. A shared mechanic needs source-backed examples and recorded
choices before a new assessment can rely on it.

## Not expressible yet

- Dungeons. No Standard card ventures today.
- Replacement ordering when two replacements change where something goes. None
  of these cards produce it.
- Effects that take control of a permanent, morph, disguise, and other face-up
  replacement effects.
- Read ahead, general spell copying, and double-faced token copies.
- Phyrexian and snow mana payments.

A selector may use `nameOf: ObjectRef` to match an object sharing a name with
that reference. The reference may be a bound result or a departed object read
through last known information. This comparison grants no hidden-zone access.
A `move` with `as` may add `countFrom: Zone`: its binding retains the moved
objects and an amount counting those that came from that zone.

`{ "enteredThisTurn": ObjectRef }` holds only for a current battlefield
incarnation whose entry followed the start of the current turn.

An exile `move` may use `until: { leaves: ObjectRef }`. It does nothing if that
battlefield incarnation already left. Otherwise the exiled card returns to its
original zone immediately after that source leaves, without a triggered ability.
This tracks only the exiled incarnation and also makes it `linked` to the source.

Standing `damage-rule` registrations accept the same `mode` and optional
`combat`, plus `from` (a source selector), `to` (`{object: selector}` or
`{player: reference}`), and `if`. Filters read current characteristics at each
event; departed damage sources use their last known characteristics. Source
selectors default to any zone. See [prevention](examples/prevention.md) for
limits and a spell that prohibits prevention before dealing its damage.

Private selections are checked against the actor's earned view before card
identities can enter a choice. A selector that can reach another unseen hand
stays pending, including when a name or type filter would find nothing there.
Scope your own hand with `controller: "you"`; an opponent choosing from their
own hand uses `who: "opponent"` and `controller: "opponent"`. A prior `look`
permits selection from its inspected objects. Choosing library order also needs
a prior look; a random order names no cards and requires none. A blocked
selection creates a gap without asking a player, moving a card or choosing a
fallback. These checks enforce visibility, not the legality of the card claim.

### Face-down exile and ongoing play conditions

A `move` into exile may set `faceDown: true`. An explicit private `look` earlier
in that resolution lets its viewer keep looking at the new exiled incarnation
(406.3). Its identity stays private and it has no characteristics in exile.
A permitted cast or land play reads its prospective face-up characteristics
and turns it face up on confirmation. Departing exile or being exiled again
ends the old permission and look entitlement. Uninformed selection from
exiled piles remains unsupported.

`permit.while` checks a condition on each use, with "you" fixed to the granting
controller. It can become false and true again without removing the note.
It supports live counts, life, history and turn conditions; source, target,
binding, event and named-choice captures are refused. An instruction
`if` checks only on resolution. See `examples/face-down-exile.md`.

Player speed belongs to the seat. The `start your engines!` keyword starts it
at one during the state check; the inherent ability increases it once on each
of that player's turns when an opponent loses life. This trigger has no source
and uses the normal stack. A max speed grant reads `{speed: "you"}` equal to
four through a conditional continuous registration. See [player speed](examples/speed.md).

### Manifest dread and face-down creatures

`keyword` with `name: "manifest-dread"` takes `who` and no `count`. It inspects
two privately, manifests the chosen card, then moves the remainder to the
graveyard. An empty library still completes this keyword without drawing.
`as` binds the manifested permanent. `move` with `faceDown: "manifest"` moves
one card from another zone onto the battlefield; the shared keyword supplies
its controller and ordered selection. Other multi-card manifest instructions
must repeat the operation rather than move a simultaneous group.

The layer walk reads a nameless colorless 2/2 creature. Only its controller may
inspect the underlying identity. Every adapter receives the paid face-up
special action for a creature card with a supported mana cost. Face-up payment
works at any priority, including the opponent's turn and a nonempty stack.
It changes no incarnation and repeats no entry behavior. Departure and game end
reveal face-down permanents publicly; earlier event descriptions stay private.

`each.objects` iterates a selector over public zones, binding `bound:object`
within each iteration. It is an alternative to `each.players`, not an implicit
search or private look. Hovership uses it to read the owner of each linked
exile card, and performs nothing when there are none. See
[manifest dread](examples/manifest.md) for the complete example and limits.
