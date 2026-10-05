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
  Cleanup triggers, replacement ordering and delayed-trigger lifetimes need
  particular attention where an assessed card depends on them.
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
establish correct card meaning. Review of the accepted terms and a bounded live
opening continue below the full-game readiness threshold.

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
