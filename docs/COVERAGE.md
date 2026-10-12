# Standard coverage and remaining work

This inventory uses the October 10, 2026 card file and the September 25 rules
pinned in `decks/standard-matchup.json`. It describes that snapshot, not a claim
that legality has been refreshed today. Regenerate the counts and card-level
worklists without inference:

```sh
node tools/coverage.ts --out .pi/standard-coverage
node tools/assess.ts --report --alpha
npm run decks -- check
```

The coverage tool reads the shipped preparation store, checks its source
fingerprints, and ignores machine-local overrides. It writes `summary.json`,
`cards.json`, `unassessed.txt` and `recorded-refusal.txt`. Each card row names
its decks, preparation state, deferred-use count and any recorded refusal.

## Why nineteen became twenty

The original importer treated three unrecognized names in Boros Dwarves as
nonlegal cards. MTGGoldfish exports `Dain's Company`, `Kili the Resourceful`
and `Fili the Pathfinder`; the pinned file has `Dáin's Company`,
`Kíli the Resourceful` and `Fíli the Pathfinder`. All three are legal in that
file. The previous legality explanation was incorrect.

Name resolution now accepts a unique accent-normalized match and refuses
ambiguous matches. It does not guess spelling or change legality. The
[October 7 Boros Dwarves list](https://www.mtggoldfish.com/deck/7989225)
registers as 60 main and 15 sideboard cards and is kept in the collection.
Nineteen lists are admitted to alpha setup; Dwarves still needs thirteen
main-deck assessments. Adding a legal list is not proof that it plays.

## Size of the remaining card work

| Population | Distinct cards |
| --- | ---: |
| Legal cards in the pinned Standard snapshot | 5,164 |
| Original nineteen main decks | 255 |
| Original nineteen lists including sideboards | 312 |
| Twenty imported main decks | 268 |
| Sideboard-only cards across those twenty lists | 60 |
| Cards outside all twenty imported lists | 4,836 |

| Preparation across the whole legal snapshot | Cards |
| --- | ---: |
| Shared printed handling, without rules text needing assessment | 22 |
| Accepted assessment with all identified uses prepared | 128 |
| Accepted assessment with deferred uses | 159 |
| Recorded refusals without an accepted replacement | 21 |
| Not assessed | 4,834 |

The 159 deferred cards contain 233 deferred uses. Even a complete assessment
means accepted structured terms, not verified play. Unassessed cards are unknown,
not 4,834 proven engine gaps. Several recorded refusals predate mechanics added
overnight and need reassessment before becoming implementation tasks.

## Work order and completion gates

| Order | Work | Completion evidence |
| --- | --- | --- |
| 1 | Exercise the original nineteen lists. Ten have no counted finish; resume the saved pairings and two stopped games. Direct Typesafe Jev and CLI Haiku now work; no OpenRouter credits are needed for that route. | Ordinary setup, source-reviewed outcomes, no missing-machinery gaps, replay and clone parity. Then swapped seats and imported-deck opponents. |
| 2 | Assess Dwarves' thirteen new main-deck cards, implement genuine gaps, generate its guide and prepare a matchup. | Standing terms and use inventory admit the twentieth list; real games determine runtime work. |
| 3 | Reassess the 21 refusals and three additional unassessed sideboard-only cards introduced by Dwarves. Keep this separate from the sideboardless alpha. | Source-reviewed terms and relevant interactions; then a match lifecycle with legal sideboarding and per-game deck registration. |
| 4 | Add representative legal lists with new mechanics. Select cards by reuse across lists and distinct interactions. | Each expansion earns the same game evidence as the first pool. Do not implement thousands of isolated exceptions. |
| 5 | Assess the remaining legal universe in bounded batches, group refusals by shared missing operation, implement that operation, then reassess its cards. | Every legal card has reviewed standing terms and a use inventory, plus evidence for each mechanical family and its interactions. |
| 6 | Audit the general rules and refresh the pinned sources as an explicit migration. | Replacement ordering, layer dependencies, loops, permissions, privacy and timing have representative fixtures; old journals retain their source pins. |

No reliable engineering-day estimate follows from the card count. Source
assessment can be divided into independent card batches; shared mechanics and
interaction validation require review and games. The generated worklists make
those batches concrete without pretending each card needs new engine code.

## Dwarves' main-deck work

The thirteen cards are Basilisk Collar, Chainsaw, Dáin's Company, Doc Ock's
Tentacles, Dragonfire Blade, Dwalin, Weaponmaster, Dwarven Mauler, Iron Man
Armor, Kíli the Resourceful, Lavaspur Boots, Leyline Axe, The Lonely Mountain
and Thorin, Mountain-king. Equipment, private library looks, triggered damage
and activation discounts already have shared operations. Assess their exact
wording against those operations first.

Likely additional work includes pregame permanent entry for Leyline Axe,
the enduring-story designation and first-equip alternative price for Kíli,
hone counters' effect on the equipped creature, and Thorin's multiple Equipment
attachments followed by a reflexive trigger. Dragonfire Blade also needs an
exact color-qualified hexproof check and a discount based on the target's colors.
These are source-reading candidates, not accepted assessments.

## Known refusal families and broader rules

Replacements and prohibitions have concrete outstanding cases: Rest in Peace's
global graveyard replacement, Crystal Barricade's noncombat prevention,
Sunspine Lynx's life-gain prohibition, Nowhere to Run's selective hexproof and
ward exceptions, and Sheltered by Ghosts' linked exile/return. Multiple
replacement effects on one event still need affected-player ordering; passing
single-effect tests does not cover their composition.

History and duration cases include Elegy Acolyte, Preacher of the Schism,
Raven Eagle, The Queen of Dale, Vengeful Tracker and Hydro-Man. Reassess their
precise event-time tests against the new history operations. An ability's
once-per-turn limit is not interchangeable with a first-event condition.

Other recorded cases are Aven Interrupter, Decorum Dissertation, Intimidation
Tactics, Laughing Jasper Flint, Leatherhead, Oildeep Gearhulk, Ral,
Sphinx of False Conclusions, The Ooze and Thought-Stalker Warlock. New plot,
copy, emblem and private-selection operations may remove portions of these
refusals. The inventory retains each complete reason and its date.

Outside-game access remains explicitly blocked for Extrapolate the Impossible,
North Wind Avatar and Turtles Forever. Supporting those cards requires the
appropriate registered sideboard access and visibility, independently of whether
an alpha game omits sideboards. Best-of-three match handling, restart/setup
between games, sideboard edits and guide policies are additional work.

The wider inventory includes overlapping text tags to direct review: 364
unresolved cards mention replacement/prevention wording, 218 copies, 562
permissions or alternative costs, 577 hidden selection, 610 history/counting,
293 choices/types/names, 243 attached permanents, 172 multiple faces and 1,164
counters/designations. These counts locate candidates. They are neither
disjoint totals nor claims that all those operations are absent.

Broader completion also needs timing and interaction audits: casting and
activation announcements, continuous-effect dependencies, last-known
information, state-based actions, optional and mandatory loops, combat
restrictions and requirements, and information earned by a seat. Multiplayer
and Commander are separate goals; they are not prerequisites for legal
two-player Standard.
