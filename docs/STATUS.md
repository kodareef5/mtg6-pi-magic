# Gameplay status

Jev pilots, Sol 6.1 high prepared the carried matchup briefs, and Luna low
writes strategy and judges. Playing strength is unproven. No coded lethal
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
- The analyst wave is not earning its place: the coordinator alone played
  twenty seeds at a tenth of the strategy calls and a quarter of the cost with
  no loss of legality or adherence (table below). Deleting it is the next
  change to make.
- Luna low finds the recorded growth lines about one time in three at any
  timeout; Luna high about three in five; Haiku 5.5 medium, Haiku 5.5 high and
  Sol 6.1 high every time. Effort is the lever, not the prompt or the limits.
  The roster is unchanged pending a decision.

## October 10 measurements

All arms on the same twenty fresh seeds, each list on the play in half, from
the same carried preparation, two games at a time. Raw games, call traces and
per-game rows are in `.pi/sim-20261010/`. Baseline and no-survey ran Luna
low; the Sol and Haiku arms changed only the strategy model.

| Measure | Baseline, wave on | No survey | Haiku 5.5 medium, no survey | Sol 6.1 high, wave on |
| --- | --- | --- | --- | --- |
| Games finished / started | 20 / 20 | 20 / 20 | 10 / 10 | 2 / 4 |
| Green wins / Red wins | 9 / 11 | 13 / 7 | 5 / 5 | 2 / 0 |
| Wins on the play / on the draw | 11 / 9 | 11 / 9 | 6 / 4 | 1 / 1 |
| Median turns | 12 | 11 | 10 | 9 |
| Median wall | 11.6 min | 6.5 min | 6.8 min | 56 min |
| Median strategy wait | 9.3 min | 4.9 min | 5.0 min | 55 min |
| Median cost / total | $0.52 / $9.66 | $0.13 / $2.72 | $0.19 / $2.53 | $10.63 / $29.28 |
| Median strategy calls / Jev calls | 419 / 400 | 33 / 325 | 22 / 270 | 303 / 262 |
| Plan steps taken / due, passed over, deviated | 919 / 929, 2, 8 | 786 / 821, 26, 9 | 393 / 398, 3, 2 | 96 / 96, 0, 0 |
| Help requests | 18 | 22 | 6 | 0 |
| Gaps | 0 | 0 | 0 | 0 |
| Replay mismatches | 0 | 0 | 0 | 0 |

Stopped games were resumed from their saved journals rather than replayed:
one no-survey and two Haiku games had stopped on the OpenRouter key limit or
a Haiku coordinator timeout at 90 seconds, and one no-survey game on an
interpretation refusal that named the wrong field, fixed in `ca01bd8` before
the resume. Totals include the stopped prefixes. Two Sol games were cut off by
the runner's two-hour limit after $17 and are resuming. Twenty games separate
nothing on wins between these arms; they do separate cost, speed and gaps.

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

## How a change is judged now

A change gets one comparison on the bulk runner: the same twenty seeds, both
arms, read on wins by deck, turns, wall, cost, help, gaps and plan adherence.
A/A noise on the saved-position suite was ten points, so a smaller move is
nothing. The change is kept or deleted the same day. No arm stays as a flag and
no branch outlives its comparison.
