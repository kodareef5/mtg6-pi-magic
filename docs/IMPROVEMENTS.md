# Strategy process improvements

October 10. [Plans](PLANS.md) is the gameplay contract and [Status](STATUS.md)
the results. This page is the next change and how it is judged. Everything
longer, including the October 9 measurements and the rejected rehearsal, is in
ignored `design-ref/experiments/`.

## Judged how

`npm run sim` plays twenty fresh seeds per arm, each list on the play half the
time, from the same carried preparation, two games at a time. Arms are compared
on wins by deck, turns, wall time, cost, help requests, gaps and plan adherence,
which is derived on replay. A change is kept or deleted on the day of its
comparison.

## Next, in order

1. Baseline at `dc55706`: twenty games, Luna low, analyst wave on. Done; the
   table is in [Status](STATUS.md).
2. The model question, once. The five growth and lethal fixtures with strategy
   on Sol 6.1 high and on Luna high, three repeats each, read for real wins
   against the Luna-low control. If a stronger model finds the lines, Luna-low
   prompt work on growth stops; if it does not, the problem is facts and
   structure.
3. The fan-out question. Twenty games with `--no-survey`, the coordinator
   alone. If it is no worse, the analyst wave goes.
4. Attribute the recorded growth misses by stage (facts, discovery, selection,
   writing, pilot, execution) before any planner rewrite. The
   `process/explored-lines` branch waits on that reading.
5. One fresh pregame, with its brief kept and its cost stated.

## Retained from October 9

- `--findings FILE` reuses recorded analyst reports for an isolated writer
  comparison.
- The payment forecast keeps its checks before an unknown continuation.
- An own-turn answer must keep or replace `steps` and `theirTurn` explicitly.

## Rejected, do not repeat

Context trims (broad, calculation-only, pilot notes), a choose/write split,
three narrower analyst questions, a win/survival/development objective,
optional checked fragments, plan before rationale, pilot tap annotations,
automatic combat-fact attachments, and the draft rehearsal interface (0 of 24
unassisted successes against 6 of 24, 37 of 39 previews dead on script
syntax). Details and raw results are in the ignored evidence directories.
