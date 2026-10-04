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

## Run the matchup

```
npm run matchup
```

`npm run matchup` plays both lists live through Pi from ordinary setup, with no
scripted line, and stops at an outcome, the first gap, or `--turns`. The table
offers land plays and printed-cost casts of permanent spells; everything a card
does beyond entering comes from a seat's plan in the syntax. The machinery for
triggers, statics, combat and the wider instructions is being built in stages;
until then the run plays lands and vanilla bodies only.

An earlier version of this tool scripted Forest, Llanowar Elves, Mountain and
Shock as a prescribed probe, with an authored offline mode. Both are gone: the
probe dictated the line, and the offline mode was a second path that could
disagree with the live one. The observations below come from that probe.

## What this opening added

Prepared procedures now carry spell timing, a destination and one announced
creature or player target. Printed type, cost and power/toughness come from
the pinned card file, not from the claim.
Literal damage uses that target. Menus expose source, target, payment and
remaining instructions; replay uses the accepted terms without interpreting
the card again. No card compiler or separate casting engine was added.

These terms cover the Elf/Shock exchange. They do not implement all targets
allowed by Shock, which can also hit planeswalkers and battles. The current
creature check uses printed toughness; modifiers, indestructible and
damage replacement effects are not implemented. Giving Mossborn Hydra its
printed 0/0 without its entry counter would be incorrect play.

Tests exercise unpaid and stale announcements, target departure before
resolution, cancellation of the whole targeted effect, summoning sickness,
damage before the state check, conservation of all 120 cards, and a clone
that keeps the paid cost and pending response.

## Live observations

The October 4, 2026 Pi run used `gpt-6.1-sol:low` for preparation and
`typesafe/jev-latest` for decisions. Three initial attempts missed the line.
The first exposed an invented land-option prefix and an adoption review with
no recipe attached. The next two exposed ordinary land plays bypassing draft
progress, including a play made before adoption.

Strategy now receives printed creature stats and explicit selector and review
instructions. Adoption menus show the recipe's guidance and step labels;
ordinary plays say that they do not adopt or advance a draft. The alternatives
remain selectable. Executable recipes stay out of the classifier packet.

Continuing a prefix with both live-authored plans then completed the exchange.
The final verification used 31 additional classifier calls, no fresh strategy
calls, 7.1 seconds and $0.0045 at recorded catalog prices. These figures cover
the continuation, not preparation or the failed attempts. Its full ledger has
28 forced, 2 delegated, 4 chosen and 4 declared decisions, with no fallbacks or
engine gaps. Both cards reached the graveyard; all 120 registered main-deck
cards remained accounted for. Replay matched objects, receipts, ledger,
equipment, resolution and cursor.

The broader replay check initially found a monitor boundary mismatch: live
observation stopped immediately after the Elf died, while replay had already
granted the next priority. The monitor now reaches that same next-decision
boundary without answering it. No physical action was missing or repeated.

The failures and successful continuations remain separate local journals and
call traces. This is evidence that the prescribed exchange executes, and also
evidence that navigating preparation needs further evaluation.

## Card review

Every card in both lists, checked against `docs/SYNTAX.md`. "Uses" are the ways a
player actually plays the card; each needs only the shapes listed. Nothing here
is a per-card handler: these are the procedures and packages a seat writes when
it plans to use the card. Examples are in `docs/examples/`.

A card no shape could express would grow the syntax, or go on
`cards/unsupported.txt`. None does.

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
