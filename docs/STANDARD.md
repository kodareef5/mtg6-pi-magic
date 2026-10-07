# Standard matchup

The pinned decks, card data and rules are in `decks/standard-matchup.json`.
The next version's approved contract and commit sequence are in [Plans](PLANS.md).
Current measurements are summarized in [Gameplay status](STATUS.md).
Detailed historical runs are local reference material under `design-ref/`.

## Earlier shared-mechanics gate

The shared-mechanics gate finished on turn 16 with Red winning, no recorded gaps
or fallback, and matched replay. With carried preparation it used 15m14s of play,
675 Jev calls, 67 Luna low strategy calls and $0.2621 of reported model cost.
Strategy waiting remained 12m07s. The exact-request review found strategic errors
and a missing pending-window fact in Jev context; that fact was added and checked
against the saved decision. This is not an expert-play result or a complete
legality audit. This earlier result does not establish current playing strength.

## Previous batch

The focused-context gate and three further games used Jev, Sol 6.1 high pregame,
Luna low strategy and judge, and summaries off. Three games reached outcomes;
one stopped at a combat-damage menu with 1,041 classifier choices. All four
replays matched. None used fallback or delegated physical actions.

| Game | Outcome | Turn | Prep / play minutes | Reported cost |
|---|---|---:|---:|---:|
| Gate | Green won | 19 | 12.4 / 27.0 | $1.5525 |
| Regular 1 | Stopped at classifier capacity | 13 | 19.7 / 16.1 | $1.0187 |
| Regular 2 | Red won | 16 | 7.2 / 19.9 | $1.0220 |
| Regular 3 | Red won | 18 | 15.1 / 25.9 | $1.2292 |

These games establish execution examples, not expert play or a complete legality
audit. Strategy waiting consumed 61-75% of play time; 156 of 393 strategy calls
followed refused submissions. The three regular games carried card assessments
but generated fresh briefs. Their setup time cannot be attributed to new card
assessment. The separate failed initial assessment attempt cost $0.8684.

Current reproductions and priorities are in the Plans checklist. The saved
artifacts are under `.pi/jev-focused-20261005/`, including journals, exact calls,
results, replay-checked positions and interactive timelines. Historical request
numbers and detailed error analyses remain in the run archive.

## Run the matchup

```
npm run matchup -- --prepare
npm run matchup -- --resume <prepared-journal> --version 0 --turns 2
```

These are opt-in paid runs through Pi. The first assesses cards and prepares
briefs, then saves version zero without playing. Review its accepted terms before
the second command deals normally and stops at an outcome, a gap, or the turn
limit. The version-zero clone reuses preparation. Standing terms and identified
uses precede dealing; executable cast and activation bodies can be prepared when
a visible source enters their accepted scope. Older positions without those
assessments can still replay but cannot resume play. Existing complete assessments
remain usable without reinterpretation.

The earlier scripted Elf/Shock probe established payment, response and replay
mechanics only. Its 31-call continuation and the later 28-call full game used
obsolete execution policies; neither is a target for current call counts.

## Card review

Every card in both lists, checked against `docs/SYNTAX.md`. "Uses" are the ways a
player actually plays the card; each needs only the shapes listed. Nothing here
is a per-card handler: these are the candidate procedures and registrations the current model prepares.
The next version prepares shared mechanics and relevant uses under explicit readiness. The table below is a syntax inventory, not a completed semantic audit. Examples are in `docs/examples/`.

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
