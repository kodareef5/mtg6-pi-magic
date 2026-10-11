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

## Current breadth coverage, October 10

The main-deck-only counts above are historical. Setup registers sideboards too.
The report now covers all 312 distinct cards across nineteen imported lists:
208 have compatible stored standing assessments, 99 have refusal records, five
are basic lands, and none remains unassessed. Every imported list is blocked.
The closest are 4c Control, Izzet Aggro and Selesnya Landfall, each missing three
assessments. No new whole-deck game was started or counted as complete.

Preparation storage now checks source fingerprints and the interpreter contract,
excludes the ledger from packages, writes records atomically, and serves the
shared seating path. Seating reads `prepared/packages` as a shipped seed and
writes new assessments to `~/.pi/agent/magic/packages/<date>/`, respecting
`PI_CODING_AGENT_DIR`. A bad record or cache write emits a notice and leaves the
game's accepted equipment intact. `tools/assess.ts` explicitly maintains the
shipped seed. Existing journals keep their accepted equipment. Life-cost
mana, conditional mana at payment, and optional entry payments have conservation
and replay coverage.

Shared face mechanics cover alternate casts, Adventure exile permission,
Omen shuffling, paid Room unlocks, transformation, craft's paid source binding,
Saga lore and chapter completion, finality counters, and Prepare's copy lifetime.
The unchanged card TSV has a source-hashed face companion. New journals pin it;
old journals retain the prior single-face representation.

Mana-value and color queries derive facts from structured costs and faces.
They read announced X on the stack, computed selector bounds and the previous
incarnation after a spell leaves. Payment does not change mana value. The pilot
and strategy receive these facts only through the seat's projection. A modify
instruction binds its affected objects for a later instruction, so Day of Black
Sun can destroy exactly the creatures whose abilities it removed.

The completed assessment passes used Sol 6.1 high. The runtime check used the
selected strategy role, Haiku 5.5 medium. Costs include every request, including
retries; input totals include cached tokens.

| Pass | Cards | Accepted / refused | Calls | Input / cached | Output / thinking | Summed / active time | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Face mechanics | 17 | 11 / 6 | 41 | 945,904 / 761,344 | 10,090 / 3,071 | 5m43s / 1m36s | $0.5462 |
| Remaining main and sideboard cards | 55 | 36 / 19 | 111 | 2,427,792 / 2,211,840 | 21,351 / 6,777 | 13m48s / 3m41s | $0.8666 |
| Query-related reassessment | 18 | 6 / 12 | 47 | 1,100,239 / 894,336 | 9,801 / 3,002 | 5m49s / 1m35s | $0.5992 |
| Deferred counterspell interpretation | 2 | 2 / 0 | 3 | 91,998 / 91,988 | 2,118 / 1,498 | 18.3s / 10.4s | $0.0091 |

No provider failures or truncations were recorded in these passes. The private
traces are under `.pi/assess/takeover-faces/`, `.pi/assess/sideboards-20261010/`,
`.pi/assess/cast-facts-20261010/` and `.pi/assess/cast-facts-runtime/`.
Query reassessment accepted Scalding Viper, Starfield Shepherd, Spider
Manifestation, Moseo, Enlightened Confidant and Carnage. These are accepted source
claims and inventories, not proof that all their deferred uses can execute or
that every registered keyword has a handler. Otter's power-based blocking word,
for example, still needs a structured comparison.

The [source-backed ledger](../prepared/packages/2026-10-10/ledger.json) records
every refusal. The next shared operations include:

| Card | Remaining operation |
| --- | --- |
| Aang, Swift Savior | Airbend permission carrying its alternative casting price |
| Aang, at the Crossroads | Private bounded look, random bottom order, intersecting card types |
| Cecil, Dark Knight | General damage event and amount; comparison with half starting life |
| Jennifer Walters | Damage received and amount; optional once-per-turn use at resolution |
| The Legend of Roku | Permission through the next turn; mana lasting until combat ends |
| Thor, God of Thunder | Selector unions and permission through the next turn |
| Colorstorm Stallion | Actual mana spent on a cast and token copying |

All 223 invariant tests and the type check pass. The fixtures cover announced X,
hybrid colors, alternate faces, hidden-card filtering, replay and cloning with a
pending trigger after its spell was countered. Haiku's two live interpretations,
Flashfreeze and Disdainful Stroke, selected the expected targets, countered them
and replayed exactly in a registered-deck fixture. This establishes those uses,
not a completed deck game. All twenty-six collection decks loaded 750 seat
packages without inference or notices. This checks seed integration; missing
standing assessments still stop full setup.

## How a breadth change is judged

Run the invariant suite and type check, reassess affected source claims, and
interpret deferred uses when their visible source requires them. Once a pair of
lists has complete standing coverage, play from ordinary setup with the current
roster, two games at a time. Keep the journals, gaps, rulings, bill and replay
checks. Established positions test a mechanic; completed deck games establish
coverage. Strength comparisons remain closed during this breadth work.
