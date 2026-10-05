# The first real Standard matchup

The target lists are L1X0's Mono-Green Landfall and __OVC__'s Mono-Red Aggro
from [MTGO Standard Challenge 32, event 12854496](https://www.mtgo.com/decklist/standard-challenge-32-2026-09-1812854496).
The source's embedded event starts September 18, 2026. Green finished ninth;
Red finished eighth. `decks/standard-matchup.json` preserves both main decks
and sideboards, with printings combined by card name.

Each has 60 main-deck cards and 15 sideboard cards. The local deck check accepts
both lists, including the combined copy limits, against the October 3, 2026
Standard card snapshot. The pin records SHA-256 hashes of that file and the
Comprehensive Rules effective September 25, 2026. This establishes deck
legality at the pinned date, not correctness of any gameplay interpretation.

## October 5 review and work order

The October 4 Codex and Claude conversations, current code, and the saved
`real-standard-9-1791191035650` run show a coherent vocabulary for physical
play, but a broken division of work between preparation, strategy and Jev.
A completed game with zero recorded gaps did not establish correct card play.

The saved run ended on turn 20 after 25.8 minutes. Strategy waiting accounted
for 23.9 minutes, or 92.4% of elapsed time. It made 88 strategy calls and only
28 Jev calls. All 16 accepted prepared plans were amended; 30 of 32 amendment
answers rewrote phase scripts. Those figures describe the old policy.

Three causes explain the mismatch:

- Core and strategy had Oracle text, but Jev's compact packet omitted it.
  Several permanents entered without their abilities, including Nova Hellkite
  and Icetill Explorer. A ground block lacked the warning flying should supply.
- The loop executed unique plan matches and passed silently for seats whose
  plans said nothing. This bypassed Jev's action and response decisions.
- A recursive tool schema expanded at the provider to more than 430,000 input
  tokens in an isolated probe. Rewriting short answers could not fix that input.

The implementation now follows this order:

1. **Assess cards before play.** The pregame model prepares each registered
   card's full ability terms and casting or activation procedures. Every seat
   has its own equipment for both public lists and sideboards. At most four
   assessments run at once. Missing source coverage, invalid syntax or an
   explicitly unsupported operation stops setup before dealing. Accepted work
   is saved even if another card fails, so retries keep completed preparation.
   Version-zero clones carry it without new calls. Core still never interprets
   Oracle text. Source coverage is a structural check, not a semantic ruling.
2. **Make that equipment usable.** Entry attaches the accepted registrations;
   priority lists the prepared casts and activations. Strategy selects and
   sequences those uses through `prepared:N` references. Jev receives relevant
   full card text beside current characteristics and chooses actions, targets,
   payments, attacks, blocks and each seat's priority passes. Only compulsory
   rules operations and explicitly delegated resolution instructions bypass it.
3. **Keep planning bounded.** Preserve opponent-turn preparation, after-draw
   acceptance or amendment, and stops that change the unfinished line. Advertise
   shallow tool schemas and validate the complete schema locally. Measure actual
   waits and amendments; a provider latency improvement remains unmeasured.
4. **Preserve the position.** Replay now restores equipment before it lists each
   decision, including distinct payments for held resources. Repeated planning
   failures at the same physical revision have distinct recovery ids. Rollback
   and crash repair retain earlier rulings and the historical rejected branch.
5. **Validate components before live games.** Tests cover omitted-ability
   refusal, normal and warp cast menus, flying, haste, enters damage, opposing
   instant windows, failure before play, version-zero clones and replay. Existing
   invariants cover costs, targets, triggers, layers, combat, plans, visibility
   and journal lifecycle. These are offline doubles and controlled positions;
   they do not establish model interpretation quality or playing strength.

## Remaining readiness checks

Do not run a full live game to discover missing machinery. Complete these checks
in order, retaining the accepted assessment and position for any failure:

- Audit the model-produced assessment for every card in both lists against its
  full text and cited rules, especially optional costs, timing, intervening
  conditions and permissions. A quoted paragraph can still have wrong terms.
  An unrepresentable ability must stop preparation with the missing operation.
- Exercise each assessed use from a controlled position: its costs, choices,
  responses, resolution and departure. Extend the existing invariant tests,
  including interactions among cards, without adding per-card code to core.
  Replacement ordering and delayed-trigger lifetimes need particular attention
  where an assessed card depends on them. Cleanup now has focused coverage for
  waiting triggers, expiring effects, response priority and repeated discards.
- Check strategy and pilot packets at each meaningful window: a prepared line
  that survives the draw, one that needs an amendment, a held response, combat,
  and an opponent action that invalidates the line. Inspect chosen passes as
  well as actions. No target count of model calls substitutes for this review.
- Replay and clone those prefixes, including a pending choice and a ruling.
  Then try one bounded live opening with the prepared version-zero journal.
  Inspect assessment quality, actual prompt sizes, decisions, legality and
  waiting time before extending the run. A complete game comes last.

The next implementation work should follow failures in these checks. Broadening
formats, a bulk runner and model comparisons wait until these two lists work
from ordinary setup.

## Preparation measurements

The first live assessment with `gpt-6-luna:low` accepted 37 of 78 card jobs
(39 names with rules text for each seat), using 159 calls in 271 seconds.
Inspection found missing payment restrictions and effects in accepted answers,
as well as refusals of abilities the syntax supports. That preparation is not
suitable for play.

With `gpt-6.1-sol:low`, 76 jobs passed in 300 seconds and 128 calls. Both Kellan
jobs exposed a validator bug: a granted trigger's local binding was checked in
the granting procedure's scope. After fixing that, a version-zero clone reused
the 76 assessments and completed Kellan plus both briefs in 14 calls. Replay
matched with no physical decisions and no gaps. The accepted preparation is
saved privately as `real-standard-9-1791200644612`. Sol is now the suggested
pregame model; a chosen roster is never silently replaced.

These counts include lookup and correction calls. Syntax acceptance does not
establish correct card meaning. Review found Magebane Lizard's cast watch and
cast-history selectors omitted the stack zone, so they could never match. A
generic check now refuses that error. Four model calls corrected both seats'
assessments in `review-prepared-1791202094448`, reusing the rest of preparation.

## Bounded opening results

Each run below reused version-zero preparation, dealt normally, and stopped at
turn three. Calls include attempts and cancelled strategy preparation. Reviews
are Jev's private judgments about a use, separate from physical picks.

| Run suffix | Strategy | Jev reviews | Jev picks | Strategy calls | Wall time |
|---|---|---:|---:|---:|---:|
| `1791200859709` | Luna low | 0 | 45 | 9 | 62.6s |
| `1791202153756` | Luna low | 78 | 49 | 11 | 76.7s |
| `1791202788583` | Sol 6.1 low | 50 | 46 | 6 | 78.3s |

All three replayed with no recorded gaps or fallback picks. That does not
establish good play. The second run exposed two context failures: later steps
were reviewed before their earlier actions, and Fabled Passage's sacrificed
source disappeared from the resolution packet while stale casting advice
remained. Green paid the sacrifice and chose to find nothing.

Jev now reviews a use, chooses its action, and then considers the changed
position. Requesting a pass first reviews any remaining uses, then asks for a
fresh confirmation. Resolution carries the accepted effect, source text and
remaining instructions. At the saved Passage failure position, four live Jev
calls found Forest, put it onto the battlefield tapped, shuffled, and skipped
the unmet four-land untap condition.

The third run used the revised sequence and an explicitly selected Sol
strategist. It also mulliganed a playable seven down to five, so these runs
cannot compare strategist strength. The opening packet had combined play,
draw, keep and bottom advice. New briefs now separate those policies and the
packet supplies projected hand counts; old carried briefs keep their original
notes. A subsequent isolated probe compared the carried policy and a new Luna
brief at four saved opening decisions, using eight Jev calls in 1.7 seconds.
Both policies kept the original playable seven. The new policy also kept a
two-land hand without early development that the carried policy mulliganed.
The result is mixed: shorter guidance helps focus, but "early action" still
leaves the classifier to infer which cards qualify. Opening preparation now
asks for named qualifying cards, their mana and targets, and exceptions after
mulligans. A second eight-call probe rejected that weak two-land hand, but
also mulliganed a five-card keep the carried policy accepted. Better opening
play remains unproven.

A continuation of `1791200859709` played only turns three and four and saved
`1791204383584`. It made 149 Jev calls (92 reviews and 57 picks), 20 strategy
calls, and took 189 seconds. It replayed with no gaps or fallbacks but exposed
two failures that those counters cannot detect:

- Green's plan expected Chocobo's landfall before Chocobo entered. Packets now
  include the registered watches on visible battlefield sources, separate from
  cards in hand. The planner's generic land-before-creature example was removed.
  At version 49, one isolated plan review reversed the order correctly. Its
  prose still misread Hired Claw's attack trigger; this did not prove the whole
  plan sound.
- Green correctly answered Shock with Snakeskin Veil, but Shock's resolution
  menu supplied no way to ignore the newly protected target. Resolution now
  offers that choice beside the original marked continuation. At version 84,
  two live Jev calls applied hexproof and finished Shock without damage. The Elf
  survived with its counter, and the resulting journal replayed identically.
  Offline cases cover partially legal targets, targeting one's own hexproof
  creature, choosing the marked continuation, and gaining hexproof during an
  effect without restarting its target check.

The declined attack came from guidance calling Hired Claw summoning-sick after
that restriction had ended. Projection now reports the current restriction to
both seats, alongside the existing physical eligibility checks. Pilot packets
also retain current types and subtypes, and watches list visible objects that
match their selectors. At version 91, a fresh Jev review noticed the false
sickness claim and requested repair. The unmodified clone kept its historical
reviews and still chose no attackers; changing code does not erase seat memory.

Two isolated planner reviews used that same version and the same request:

| Strategy | Calls | Wall time | Cost | Observed repair |
|---|---:|---:|---:|---|
| Luna low | 2 | 25.8s | $0.0045 | Chose an attack, but spent one Village twice, scheduled a cast in a completed phase, and denied Claw's Lizard subtype. |
| Sol 6.1 low | 1 | 20.5s | $0.0714 | Chose Claw's attack, accounted for its trigger and possible block, and preserved the mana restrictions. |

Both answers passed structural validation and their accepted plans replayed.
With Sol's plan, three Jev calls reviewed the phase and use, then selected the
attack. That probe applied no physical move. This one position does not measure
playing strength or justify silently replacing a chosen model. Luna remains the
strategy default. The next checks should compare planner quality at the same
saved positions and trace repeated help requests, rather than count more calls
as progress.

## Luna repair context

The next review kept Luna and the saved positions. The attack repair's original
request carried 68 reusable actions and 61,352 characters of system instructions,
including the entire card procedure language. Its base still claimed Shock was
on the stack and Hired Claw could not attack. Those were earlier intentions,
despite appearing beside the current physical facts.

Ordinary planning now receives the plan and condition definitions, visible card
text and relevant accepted actions. Wider equipment and syntax remain available
through lookups. The attack request fell from 33,290 to 13,617 input tokens on its
first call, with 22 actions. Reuse keys contain action names; an earlier probe
had labelled a reused land play as a Chocobo cast. The view supplies the actual
remaining steps, mana context names the current ceiling and tapped sources,
and refusal feedback distinguishes proposed-plan errors from performed actions.

With that context, `plan-review-91-1791209674431` repaired the attack in two Luna
low calls, 27.4 seconds and $0.0019. It accounted for the Claw trigger and stopped
trying to cast Challenger or Shock from Village alone. The landfall repair
`plan-review-49-1791209674583` took one call, 15.4 seconds and $0.0016. It selected
the right card and no longer invented a counter, but still chose land before
Chocobo despite having enough mana for the better order. Both accepted plans
replayed; neither result establishes strong play.

A private two-stage experiment asked Luna to choose the line before writing
syntax. It still chose the weaker landfall order, and the attack translation
exhausted its three replies on invalid conditions. That extra call is not part
of the implementation. All of these probes stop at planning; they play no turns.

Changing only Luna's thinking level improved the same saved repairs:

| Position | Effort | Calls | Call wall time | Result |
|---|---|---:|---:|---|
| Chocobo before land, version 49 | medium | 2 | 33.9s | Still played land first. |
| Chocobo before land, version 49 | high | 1 | 36.7s | Cast with the existing Forest, then play Forest; keep Elf for Veil. |
| Same version 49, repeated | high | 1 | 50.8s | Repeated the correct order. |
| Hired Claw attack, version 91 | high | 1 | 27.9s | Attack and trigger; no cast from Village alone. |

The high probes are `plan-review-49-1791210024476`,
`plan-review-49-1791210293542` and `plan-review-91-1791210024476`.
Each cost $0.0015 to $0.0022 at Pi's recorded catalogue price; the repeat used
cached input. Low and medium reported no reasoning tokens in these probes;
high reported 939 to 2,134. These were effort-comparison probes, not the testing
baseline. The user specified `gpt-6-luna:low` for strategy, judge and summary,
and `gpt-6.1-sol:high` for pregame planning. The temporary high strategy default
was reverted. These small probes measure sequencing, not playing strength.

A new main-phase repair at version 75 exposed a remaining weakness: Luna high
planned to spend its only Shock, then mentioned Shock as a response on the next
turn. Its physical actions were affordable, but future guidance did not account
for the spent card. Resource accounting across the whole proposed line and the
opponent's turn remains a strategy-quality check.

The first bounded continuation of the high plan, `real-standard-9-1791210293742`,
completed Chocobo, Forest and the landfall counter while keeping the Elf untapped.
It took 80.9 seconds with 45 Jev reviews and 24 picks, no gaps or fallbacks, and
matching replay. Jev asked for a repair merely because the land play was absent
while Chocobo was on the stack. That session spent three Luna calls. Later review
questions also repeated completed instructions without naming recorded progress.
The checklist now considers the stack response before later uses, and both
review and move questions distinguish waiting for resolution from a broken line.
Reviews name recorded plan actions and do not treat every card left in hand as
an unfinished obligation. Both seats still choose their own responses and passes.

Repeating that continuation in `real-standard-9-1791211038183` took 58.5 seconds,
with 43 reviews, 27 picks, no gaps or fallbacks, and matching replay. The stack
wait no longer caused a repair. After the counter resolved, Jev still asked to
revise the completed phase; Luna used one call and added a second Elf paid from
the new Forest, preserving the original Elf for Veil. That completed-phase
repair was isolated next. Both runs also started background preparation, so
their total strategy time overlaps play and is not their wall time.

The completed-phase position was frozen before that help request. The checklist
now supplies remaining unrecorded actions for the current phase window, with
different review wording for phase work and individual card uses. At the same
position, `decision-review-1791211328625` reviewed the completed phase and four
cards, then chose pass: six Jev calls, 1.3 seconds of call time, no repair.
The probe applied only private review judgments and left the physical pick
unapplied. An empty remaining list still requires checking pending effects and
responses; it does not end the phase for the seat.

The final repeat, `real-standard-9-1791211422708`, completed the saved high plan
in 15.5 seconds: 35 Jev reviews and 23 picks, no help requests, no gaps or
fallbacks, and matching replay. Chocobo had its counter, the new Forest and
original Elf stayed untapped, and Veil remained in hand. Each seat chose its
passes. Two background preparations were cancelled at the turn limit; neither
returned a plan. This checks execution from an accepted plan, not the time to
prepare that plan or the quality of a whole game.

Full games remain behind the readiness checks above. Next probes should keep
the same saved decision when comparing context, inspect accepted card terms,
and check completed effects and chosen passes, not just call counts.

The cleanup component review fixed a separate timing failure. Damage and
temporary effects now expire together after discarding, before the state
check. A state-based action or waiting trigger opens priority for both seats;
after the stack empties and both pass, another cleanup begins (514.3a).
The regression checks that drawing cards in this window waits for the repeated
cleanup's discards, a legal instant response is offered, and replay restores
the same position. This is a rules operation, not a card-text interpreter.

## Run the matchup

```
npm run matchup -- --prepare
npm run matchup -- --resume <prepared-journal> --version 0 --turns 2
```

These are opt-in paid runs through Pi. The first assesses cards and prepares
briefs, then saves version zero without playing. Review its accepted terms before
the second command deals normally and stops at an outcome, a gap, or the turn
limit. The version-zero clone reuses preparation. Older positions without complete assessments can
still replay but cannot resume play under the new preparation requirement.

The earlier scripted Elf/Shock probe established payment, response and replay
mechanics only. Its 31-call continuation and the later 28-call full game used
obsolete execution policies; neither is a target for current call counts.

## Card review

Every card in both lists, checked against `docs/SYNTAX.md`. "Uses" are the ways a
player actually plays the card; each needs only the shapes listed. Nothing here
is a per-card handler: these are the procedures and packages the pregame model must assess before
play. The table below is a syntax inventory, not a completed semantic audit. Examples are in `docs/examples/`.

A card no shape could express would grow the syntax, or go on
`cards/unsupported.txt`. The inventory found candidate shapes for every card;
acceptance and interaction tests must still check the exact terms.

### Mono-Green Landfall

| Card | Uses | Shapes | Example |
|---|---|---|---|
| Forest | land drop, mana | basic land type (305.6) | |
| Llanowar Elves | turn-one mana | default cast; `mana` package | `mana.md` |
| Fabled Passage | fetch a basic for landfall, at four lands untapped | cost `tap`, `sacrifice`; `choose` library, `move` tapped, `shuffle`, `untap` with `if` | `search.md` |
| Escape Tunnel | fetch; or make a small creature unblockable | the same; `modify` with "can't be blocked", target with `power` atMost 2 | `search.md`, `until-end-of-turn.md` |
| Elven Passage | fetch, untap it by beholding an Elf | cost `life`; `choose` with `reveal` and `may`, `untap` with `if: bound` | `costs.md` |
| Promising Vein | colorless mana; fetch for {1}; a Cave for Glimpse | `mana`; cost with `mana` and `sacrifice` | `mana.md`, `search.md` |
| Ba Sing Se | mana; earthbend a land as a sorcery | `enters` tapped with `if`; `mana`; earthbend as `modify`, `counters`, `delay` | `entering.md`, `animation.md` |
| Earthbender Ascension | enters: earthbend and fetch; landfall quest counters | enters `watch`; landfall `watch` with `reflect` and `check` | `triggers.md`, `animation.md` |
| Glimpse the Core | fetch a Forest; or return a Cave | two mode procedures; `supertypes` basic with `subtypes` Forest; graveyard target, `move` tapped | `spells.md`, `search.md` |
| Icetill Explorer | extra land, lands from graveyard, landfall mill | `permit` lands and landsFrom; landfall `mill` | `baseline-overrides.md` |
| Keen-Eyed Curator | exile graveyard cards, grow at four card types | activation with `link`; `continuous` with `distinct` | `statics.md` |
| Meltstrider's Resolve | fight on entry, toughness and a blocking word | Aura cast with `attach`; enters `watch` with `fight`; `continuous` on `attached` | `statics.md` |
| Mightform Harmonizer | landfall doubles power; warp for a turn | landfall `watch` with captured `power`; warp procedure | `until-end-of-turn.md`, `warp.md` |
| Mossborn Hydra | enters with a counter, doubles on landfall, trample | `enters` counters; landfall `counters` by `counters`; words | `entering.md` |
| Sapling Nursery | cheap with Forests; landfall Treefolk; exile for indestructible | `reduce` by `count`; landfall `token`; cost `exile`; `modify` every | `costs.md`, `triggers.md` |
| Sazh's Chocobo | landfall growth | landfall `counters` | `turn-plan.md` |
| Snakeskin Veil | save a creature from removal | target your creature; `counters`, `modify` hexproof | `until-end-of-turn.md`, `reactions.md` |
| Surrak, Elusive Hunter | trample; draw when targeted | spell `words` "can't be countered"; `targeted` watch over battlefield and stack | `triggers.md`, `stack-and-replacements.md` |
| Origin of Metalbending (side) | destroy an artifact or enchantment; or save a creature | two mode procedures; `destroy`; `counters`, `modify` indestructible | `spells.md`, `until-end-of-turn.md` |
| Soul-Guide Lantern (side) | graveyard hate on entry or on demand; cycle | enters `watch` with graveyard target; `move` every; cost `sacrifice`; `draw` | `statics.md`, `costs.md` |
| Torpor Orb (side) | stop enters triggers | `suppress` | `stack-and-replacements.md` |
| Warg Tactics (side) | kill a flier; or protect and push damage | mode procedures; target with `words` flying | `spells.md`, `until-end-of-turn.md` |

### Mono-Red Aggro

| Card | Uses | Shapes | Example |
|---|---|---|---|
| Mountain | land drop, mana | basic land type | |
| Abrade | 3 to a creature; or destroy an artifact | two mode procedures | `spells.md` |
| Burst Lightning | 2 to anything; kicked, 4 | any target; kicked variant | `spells.md` |
| Emberheart Challenger | haste attacker; prowess; valiant card advantage | words; `cast` watch; `targeted` watch `limit` once; `move` top, `permit` | `until-end-of-turn.md` |
| Hired Claw | ping when Lizards attack; grow once a turn | `attacked-with` watch with a player target; activation with `if` and `limit` | `triggers.md`, `until-end-of-turn.md` |
| Kellan, Planar Trailblazer | level up to Detective, then Rogue with double strike | `modify` indefinite with subtypes `set`, `base`, words, granted `watch` | `animation.md` |
| Lightning Strike | 3 to anything | any target | `reactions.md` |
| Nova Hellkite | enters ping; warp for a hasty swing | enters `watch` with opponent's creature target; words; warp | `triggers.md`, `warp.md` |
| Rockface Village | mana, creature-only red; pump and haste a Lizard | two `mana`, one with `spendOnly`; sorcery activation | `mana.md` |
| Shock | 2 to anything | any target | `spells.md` |
| Smaug the Magnificent | Treasure each upkeep; attack for damage per Treasure | upkeep `watch` with `token`; `attacks` watch with `count` | `mana.md` |
| Soulstone Sanctuary | colorless mana; becomes a 3/3 for good | `mana`; `modify` indefinite with `allCreatureTypes` | `animation.md` |
| Witchstalker Frenzy | 5 to a creature, cheaper after attacks | `reduce` by `history` attacked | `costs.md` |
| Zhao, the Moon Slayer | menace; nonbasics enter tapped; make them Mountains | words; `enters` with `affects`; conditional `continuous` setting land subtypes | `entering.md` |
| Fiery Annihilation (side) | 5 to a creature, exile its Equipment, no dying | dependent second target; `register` a `replace` | `stack-and-replacements.md` |
| Ghost Vacuum (side) | exile graveyard cards; later return the creatures | `move` with `link`; `move` every linked under your control with flying counters, then `modify` | `statics.md`, `animation.md` |
| Hexing Squelcher (side) | ward for itself and your creatures | words; ward `watch` with `counter` unless; `continuous` granting a registration | `stack-and-replacements.md` |
| Magebane Lizard (side) | punish noncreature spells | `cast` watch by any player; `event:player`; `history` cast | `triggers.md` |
| Sunspine Lynx (side) | punish nonbasic lands | words; enters `watch` with `each` and `count` | `stack-and-replacements.md` |

Both sideboards are a zone: their cards start outside the game. No card in either
list reaches outside the game, so a single game never moves them.
