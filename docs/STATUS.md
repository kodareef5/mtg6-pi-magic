# Gameplay status

Jev pilots, Sol 6.1 high prepared the carried matchup briefs, and Haiku 5.5
medium writes strategy and judges since October 10; every measurement below
with Luna low predates that. Playing strength is unproven. No coded lethal
search, move filtering or automatic voluntary choice exists. The round history
behind this page, October 5 to 9, is in ignored
`design-ref/experiments/` and in Git history.

## Established

- Legal, gap-free, replay-exact games of the pinned matchup finish in about
  ten minutes for under a dollar on a carried brief. Eighty-one whole games to
  October 9: median 9.5 minutes, $0.40, 11 turns, all one matchup.
- The pilot. On a blind gold set of 147 logged decisions, accuracy went from
  0.83 to 0.92 and unneeded help from 0.07 to 0.00 (October 8).
- Structured trigger orders executed 24 of 24 played groups. A loop guard
  stops a seat that toggles the same decision.
- Every game before October 10 had Green on the play: seat 0 always starts.
  `tools/sim.ts` seats each list first in half its games.

## Open

- Judge rulings are rare and the summary role has been off in every game.
- Playing strength is unmeasured beyond legality. Wins follow the seed as
  much as the roster: Sol high won four of four as Green where Haiku medium
  and Luna low split them. The direct measure is a seat on one roster against
  a seat on another, each list on the play half the time; the runner does not
  seat two rosters yet.
- The longest new-roster game ran 22 minutes and 778 Jev calls over 16 turns.
  Long games are where strategy wait and pilot cost pile up.

## October 10 measurements

All arms on the same twenty fresh seeds, each list on the play in half, from
the same carried preparation, two games at a time. Raw games, call traces and
per-game rows are in `.pi/sim-20261010/`. Baseline and no-survey ran Luna
low; the Sol and Haiku arms changed only the strategy model. The last column
is the roster and code now on main: coordinator alone, strategy and judge on
Haiku 5.5 medium, run after the wave was removed.

| Measure | Baseline, wave on | No survey | Haiku 5.5 medium, no survey | Sol 6.1 high, wave on | New roster, `2d13d2b` |
| --- | --- | --- | --- | --- | --- |
| Games finished / started | 20 / 20 | 20 / 20 | 10 / 10 | 4 / 4 | 20 / 20 |
| Green wins / Red wins | 9 / 11 | 13 / 7 | 5 / 5 | 4 / 0 | 11 / 9 |
| Wins on the play / on the draw | 11 / 9 | 11 / 9 | 6 / 4 | 2 / 2 | 11 / 9 |
| Median turns | 12 | 11 | 10 | 10 | 10 |
| Median wall | 11.6 min | 6.5 min | 6.8 min | 56.3 min | 7.8 min |
| Median strategy wait | 9.3 min | 4.9 min | 5.0 min | 54.8 min | 6.1 min |
| Median cost / total | $0.52 / $9.66 | $0.13 / $2.72 | $0.19 / $2.53 | $10.63 / $61.67 | $0.25 / $5.14 |
| Median strategy calls / Jev calls | 419 / 400 | 33 / 325 | 22 / 270 | 271 / 262 | 25 / 355 |
| Plan steps taken / due, passed over, deviated | 919 / 929, 2, 8 | 786 / 821, 26, 9 | 393 / 398, 3, 2 | 146 / 147, 0, 1 | 812 / 823, 8, 3 |
| Help requests | 18 | 22 | 6 | 0 | 10 |
| Gaps | 0 | 0 | 0 | 0 | 0 |
| Replay mismatches | 0 | 0 | 0 | 0 | 0 |
Stopped games were resumed from their saved journals rather than replayed:
one no-survey and two Haiku games had stopped on the OpenRouter key limit or
a Haiku coordinator timeout at 90 seconds, and one no-survey game on an
interpretation refusal that named the wrong field, fixed in `ca01bd8` before
the resume. Totals include the stopped prefixes; two Sol games were cut off by the
runner's two-hour limit after $17 and resumed from their journals. Twenty
games separate nothing on wins between the Luna arms; they do separate cost,
speed and gaps. Sol high won all four of its games as Green, two on the play and
two on the draw, on seeds where the Luna baseline went Red, Red, Green, Red.

Head to head, the first direct strength reading: Green on Haiku 5.5 medium
against Red on Luna low, twenty seeds, each list on the play half the time,
on the new code (`9197896`).

| Measure | Green on Haiku, Red on Luna |
| --- | --- |
| Games finished / started | 20 / 20 |
| Green (Haiku) wins / Red (Luna) wins | 17 / 3 |
| Median turns | 9 |
| Median wall | 6.0 min |
| Median cost | $0.15 |
| Gaps, replay mismatches | 0, 0 |

With both seats on one roster Green won 9, 13 and 11 of twenty. The swapped
arm, Green on Luna against Red on Haiku, has not run; until it does this
separates deck from roster only by comparison with those same-roster arms.

Growth and lethal fixtures, five positions, three repeats, same prompts. A
real win means the plan carries the payoff spell before the first land entry,
enough entries and the lethal attackers, read by `.pi/sim-20261010/real-wins.py`.

| Strategy model | Real wins | Median session | Cost per session |
| --- | --- | --- | --- |
| Luna low | 6 / 15 | 43s | $0.015 |
| Luna low, six-times limits | 4 / 15 | 46s | $0.012 |
| Luna high | 9 / 15 | 104s | $0.024 |
| Haiku 5.5 medium | 15 / 15 | 78s | $0.08 |
| Haiku 5.5 high | 15 / 15 | 171s | $0.12 |
| Sol 6.1 high | 15 / 15 | 206s | $0.48 |

Haiku ran from a worktree with the output ceiling times four, because
Anthropic counts thinking tokens against it; a Haiku roster needs that fix
properly. A fresh pregame on Sol 6.1 high cost $1.46 and 13 minutes 41 seconds
for two briefs of about 40,000 characters; it is saved in
`.pi/sim-20261010/fresh-pregame/`.

## Deck pool, October 10

Twenty-six decks register: the two pinned lists, nineteen current Standard
archetypes imported from MTGGoldfish representative lists (Izzet
Spellementals, Jund Sacrifice, Dimir Midrange, Boros Dragons, Azorius Control,
4c Control, Lifegain, Izzet Prowess, Dimir Excruciator, Jeskai Artifacts,
Rakdos Lizards, Azorius Momo, 4c Reanimator, Mardu Discard, Selesnya Landfall,
Boros Tokens, Mono-Black Aggro, Izzet Aggro, Bant Airbending Combo), and five
practice lists. Boros Dwarves is wanted and refused: three of its cards are not
Standard-legal in the card file. `npm run decks check` reports every list.

The card file was refreshed to 2026-10-10. Its card rows are identical to the
October 3 file; only the date changed, so the test fixtures were re-stamped.
Games saved under `.pi/` before the refresh pin October 3 and replay only
against that file.

## Pool audit, October 10

`tools/assess.ts` assessed every distinct main-deck card of the nineteen
imported decks once on Sol 6.1 high: 250 cards, 128 stored, 122 refused, 551
calls, $4.51. A second pass after the land shapes below stored 28 more for
$3.19: 156 stored, 94 refused. Every imported deck is still blocked by at
least one card; the closest, 4c Control and Selesnya Landfall, by two. The
first pass's refusals by concept, with the decks each blocked:

| Concept | Decks | Cards | Status |
| --- | --- | --- | --- |
| Shock land: optional life payment on entry, else tapped | 18 | 11 | built; all eleven stored |
| Conditional mana ability (Verges, Hidden Lair) | 18 | 11 | built; ten stored, Hidden Lair needs "entered this turn" |
| Omen, adventure or split back half | 11 | 14 | shared mechanics built; updated assessment below |
| Enters tapped unless a condition on the turn | 9 | 2 | built; both stored |
| Cast trigger filtered by color or type | 8 | 5 | queries built; other operations still block some cards |
| Copy, control change, face-down | 7 | 9 | open |
| Mana spent to cast | 5 | 4 | open |
| Arithmetic: half, X, counts of cards | 5 | 6 | open |
| Model did not submit an accepted answer | 5 | 5 | retry |
| Tokens with abilities | 4 | 6 | open |
| Planeswalkers and loyalty | 3 | 4 | open |
| Long tail: sagas, airbend, classes, explore, crimes, choices as it enters, hand reveals | 1 to 3 each | about 40 | open |

The ledger is `prepared/packages/2026-10-10/ledger.json`; the grouping script
is `.pi/phase2/ledger-concepts.py`.

## Sideboardless alpha, October 11

The alpha registers main-deck copies of the nineteen imported legal lists.
The original tournament files keep their sideboards. No main-deck requirement
is waived. The pool contains 255 distinct main-deck cards. The complete store,
including sideboard cards, has 221 source-pinned assessments and 86 recorded
refusals, plus five basic lands requiring no assessment.

| Measure | Current evidence |
| --- | --- |
| Imported main decks admitted to setup | 3 of 19: 4c Control, Selesnya Landfall and Izzet Spellementals |
| Imported lists with a completed alpha game | 2: Selesnya Landfall and Izzet Spellementals |
| First Landfall game | Mono-Red won on turn 12; 400 decisions, 359 chosen, 41 forced, no fallbacks or gaps |
| Replay and clone continuation | Matched; clones at decisions 0, 200 and 399 continued to the same outcome, cards, cursor, log and equipment |
| First Landfall run cost and time | $1.0158 reported, 19m31s wall; one failed call lacks usage and cost |
| Second Landfall game, seats reversed | Mono-Red won on turn 9; 379 decisions, 348 chosen, 31 forced, no fallbacks or gaps |
| Second Landfall replay and clone continuation | Matched; decisions 0, 189 and 378 continued to the same outcome and state |
| Second Landfall run cost and time | $1.0232 reported, 17m29s wall; two calls lack usage and cost |
| Main-deck guides | All 19 written; 57 provider calls, $0.8770 |
| Control runtime failures found | Additional blight and behold costs, metadata copying, private inspection, next-cast properties, collected evidence, flashback departure |
| Rejected Control branches | Stock Up used public exile for inspection; a completed run reordered Inevitable Defeat's instructions |
| First Izzet game | Izzet won on turn 13; 325 decisions, 298 chosen, 27 forced, no fallbacks or gaps |
| Izzet replay and clone continuation | Matched; decisions 0, 162 and 324 continued to the same outcome and state |
| Izzet run cost and time | $0.9438 across preparation and continuation, 371 requests, 17m06s of run wall time; two calls lack usage and cost |

Landfall's completed game is seed `alpha-landfall-20261011-r0`, journal
`alpha-landfall-20261011-r0-1791719352675.jsonl`. Its 426 requests comprised
15 pregame, 40 strategy and 371 Jev calls. The raw journal, bill, trace and
clone checks are under `.pi/alpha-20261011/`. The reversed-seat game is seed
`alpha-landfall-20261011-r1`, journal `alpha-landfall-20261011-r1-1791720692391.jsonl`.
These games do not establish coverage of every deferred use.

Izzet seed `alpha-spellementals-20261011-r0` resumed after the shared greatest-value
amount supported Sunderflock's reduction. The completed journal is
`alpha-spellementals-20261011-r0-1791722682103.jsonl`. Source review checked the
used runtime procedures as well as replay and clone continuation.

Control seed `alpha-control-20261011-r1` reached a win on turn 19: 541 decisions,
496 chosen, 45 forced, no gaps or fallbacks. Replay matched, as did continuation
from decisions 0, 270 and 540. Source review found Inevitable Defeat's life changes
preceding exile, so the run does not count as legal gameplay coverage. Its five
preparation and continuation runs reported $1.1610 across 652 requests and
24m56s of run wall time; three calls lack usage and cost. The retained final
journal is `alpha-control-20261011-r1-1791720729937.jsonl`.

Control's ordinary games produced the payment and inspection fixes. They use
the same saved preparation when resuming a valid prefix. An interpretation
failure blocks the next physical decision; the model must supply the missing
meaning before play continues. The new private look and library-order tests
cover hidden identities, exact selection windows, short libraries, seeded
random order, incarnation preservation and cloning during a partial choice.
Haiku has prepared both Consult the Star Charts modes with those operations,
and the live game has resolved its computed private window and random bottom.

Standing reassessment retained Thor, Dyadrine, Sunderflock, Awaken the Honored
Dead and both Aang cards. This establishes source-backed terms and use
inventories, not complete deck execution. Multiversal Passage's entry choice
passed reassessment in two calls for $0.0560, admitting Izzet Spellementals.
Candy Trail's scry standing trigger also passed reassessment with the bounded
inspection operations: two calls, $0.0597.
The [refusal ledger](../prepared/packages/2026-10-10/ledger.json) retains the
remaining concepts, including sideboard work deferred from this alpha.

The current mechanics include selector unions and intersections, casting
provenance and actual mana-spent facts, payment of chosen counters and reveals,
and explicitly scoped self characteristics outside the battlefield. Firdoch
Core therefore counts as a Dragon when beheld from hand. Standing storage
remains source-pinned; ordinary seating reads shipped seeds, writes to Pi's
cache, and reports corrupt records or failed writes without stopping the game.
The selected Jev/Sol/Haiku roster is unchanged.

## How a breadth change is judged

Run the invariant suite and type check, reassess affected source claims, and
interpret deferred uses when their visible source requires them. Once an imported main deck has complete standing coverage, play it against
a supported opponent from ordinary setup with the current roster, two games
at a time. Keep the journals, gaps, rulings, bill and replay
checks. Established positions test a mechanic; completed deck games establish
coverage. Strength comparisons remain closed during this breadth work.
