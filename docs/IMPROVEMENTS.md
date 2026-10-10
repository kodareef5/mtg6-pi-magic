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

## October 10 outcomes

1. Baseline at `dc55706`: done, twenty games, table in [Status](STATUS.md).
2. The model question: answered. Luna low finds the recorded growth lines 6
   of 15 times and 4 of 15 with six-times limits, Luna high 9 of 15, Haiku 5.5
   medium, Haiku 5.5 high and Sol 6.1 high 15 of 15 each. Effort is the lever.
   Luna-low prompt work on growth stops. The roster change is a decision, not
   made here; a Haiku roster also needs the output ceiling to allow for
   thinking tokens.
3. The fan-out question: the coordinator alone matched the wave on wins,
   adherence, gaps and replay at a tenth of the strategy calls and a quarter
   of the cost. By the rule above, the analyst wave goes. That removal is the
   next change.
4. Attribution: 9 of 12 Luna-low growth misses were discovery, 3 selection, 0
   facts or writing. A planner that carries an analyst's line forward would
   not have fixed most of them. `process/explored-lines` stays paused.
5. Fresh pregame: done, $1.46 and 13 minutes 41 seconds, brief kept.

Found on the way and fixed: an interpretation refusal that named the wrong
field stopped three games (`ca01bd8`); a prepare-only run compared replay at
the wrong boundary (`b0233e9`).

## Next

Remove the analyst wave: survey, branch, growth and perspective analysts and
the dossier they share. The coordinator alone is the strategy session. One
comparison on the runner against the no-survey arm confirms nothing regressed.

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
