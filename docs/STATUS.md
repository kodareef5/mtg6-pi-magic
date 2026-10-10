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

- Growth discovery. Strategy finds landfall growth lethal (Surrak 4 to 8 to
  16, Hydra to 24, Explorer to 32) in about one case in three on the saved
  positions. Analysts rarely count the second land entry; coordinators that do
  sometimes hold the lethal attacker back as a blocker.
- Strategy wait is 78 to 87 percent of wall time, with 300 to 450 strategy
  calls a game since the October 8 analyst wave.
- A fresh pregame costs $1.45 and 11 minutes before a card is played. Every
  game since October 7 ran on one carried brief per deck.
- Judge rulings are rare and the summary role has been off in every game.

## October 10 baseline

Twenty fresh seeds at `4cda9c2`, Luna low with the analyst wave, two games at
a time, carried preparation from the October 5 version zero. The table is
written by `npm run sim -- --report .pi/sim-20261010/baseline` when the run
finishes and replaces this paragraph.

## How a change is judged now

A change gets one comparison on the bulk runner: the same twenty seeds, both
arms, read on wins by deck, turns, wall, cost, help, gaps and plan adherence.
A/A noise on the saved-position suite was ten points, so a smaller move is
nothing. The change is kept or deleted the same day. No arm stays as a flag and
no branch outlives its comparison.
