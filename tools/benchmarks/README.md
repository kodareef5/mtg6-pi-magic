# Saved-position benchmarks

`npm run benchmark` replays the positions in `positions.json` without model
calls. Each case names a journal, decision-prefix version, seat and expected
property. Compressed journal prefixes and accepted preparations are committed
under `test/fixtures/benchmarks`, outside the published package. The runner
expands them in a temporary directory and removes those copies on exit. A `.pi`
cleanup no longer deletes the inputs. Missing artifacts fail explicitly.

`red-upkeep-lethal` freezes the turn-10 upkeep at decision 270, before Red
spent all four sources on Sanctuary. Two Lightning Strikes can deal Green's
remaining six life. Use `good-upkeep-lethal.json` with `--answers`, `--repeat 3`
and `--play --through 10` for the supplied-line delivery control; omit `--answers`
to measure the production planner. Both require physical outcome review.
`red-before-upkeep` starts at decision 219, Green's turn-9 untap, before Red's
background job starts. Run it with `--live --play --through 10` to measure early
acceptance and changed-board amendment. Report generation, execution and
planning wait separately. A resumed job begins from that prefix's observations;
it does not recover the parent's process-local preparation.

Examples, run from the repository root:

```sh
npm run benchmark
npm run benchmark -- --live --task pilot --pilot both --repeat 3
npm run benchmark -- --live --task prepare
npm run benchmark -- --live --case green-landfall-order
```

`--live` spends money through Pi. Jev remains the default pilot. `--pilot luna`
and `--pilot both` are isolated comparisons against Luna low, without changing
the game's roster. Preparation and amendment always use Luna low. `--case` can
be repeated; `--out` chooses a fresh output directory, otherwise the runner uses
`.pi/benchmarks/<timestamp>`.

Pilot cases include the loop's accepted procedures and plan/resource annotations
before entering the actual seat context and inspection path. Earlier probes
omitted these annotations; their results are historical, not packet parity.
`menace-before-block` and `menace-partial-block` freeze the initial lone-Forest
block on menace Zhao and the unfinished declaration after that selection.
Their baseline requests exactly reproduce the saved parent packets. The former
grades the initial choice; the latter grades withdrawal, separately from help.
`menace-recovery` continues the partial declaration. Run it with `--live --play
--repeat 3 --decisions 12 --through 10` and inspect whether Green withdraws, then
finishes coherently. Repeated select/withdraw cycles fail recovery.
The held-vigilance case preserves a plan whose listed attack and preservation
prose disagree. Correct consumption marks alone do not prove it will execute.
`attack-before-help` freezes the October 7 ready-lethal control after Kellan
is selected, before any help request. `finish-after-help-refusal` freezes the
same declaration after both repairs, adding the exact saved transient refusal
to the pilot frame. Both remaining attacks satisfy each check; their order is
immaterial. Refusals belong to a pending question and are not journaled, so the
manifest records that missing question field explicitly.
`ready-partial-attack` is a `continue` case starting before help. With
`--live --play --repeat 3 --through 12`, it resumes existing work without
installing a new plan or resetting its progress. Report whether Sanctuary and
Zhao were declared before finishing, help before `attack:done`, and the physical
outcome separately. Help against unchanged available commitments is a separate
pilot failure; a repaired win does not establish obedience.
Luna receives the
same classifier question through a chat adapter with an exact-id submission,
one request attempt per question and a 256-token output ceiling. The adapter
does not invent confidence scores. Cases start with the recorded private plan
and brief; a request for fresh strategy fails that pilot probe. Nothing moves.

Preparation cases plan the upcoming own turn from the saved opponent-turn
position. An amendment also names its previously accepted preparation and
replays that earlier prefix to compute changes. The amendment frame carries an
explicit planning request, without editing the journal or game state.
Repair cases preserve a journal prefix with a pending help request and call
the ordinary repair path, without inventing a prepared plan. The after-Explorer
case checks for a graveyard land play already enabled by the current board and
forbids the inherited attack with a Forest that is no longer a creature.
The blocked-lethal amendment preserves the preparation actually consumed in
the continuation, reconstructed from its submission and verified against the
amendment request's complete base. Its prefix ends before that amendment was
accepted. The automatic property checks Smaug's cast before its attack and
requires attacks from Kellan and Sanctuary, the verified winning commitment.
Review payments, conditions and instruction consistency separately. Another
winning line can fail this specific property and needs human review.
With `--play`, its pass criterion is instead Red's actual win in the continuation,
with no gaps or fallback and matching replay. The structural result remains in
the report. This measures the observed game, not every possible opposing response.
`zone` matches a projected source in that zone; it does not assert that a future
zone change or permission has happened.

The runner records each answer, property result, whole-decision duration,
individual calls, model, effort, tokens, cost and complete request/response
trace. Repeated pilot comparisons alternate model order. `results.json` holds
the answers and metrics; `calls.jsonl` holds the trace. Use a new output
directory for each run. Any failed property or call makes the command fail.
Planning results include the scoped resource forecast, with optional unfunded
responses separate from ordered-step conflicts.

`--arm examples-paired` compares ordinary `planWork` with `examples-lookup`,
alternating their order by repetition. The treatment replaces only saved
`brief.policies.*.example` values with a `policyExample` lookup reference. That
lookup returns the complete original position, line and exception. Policies,
current facts, phase defaults, SYSTEM, submit schema and reply budget stay the
same. Ordinary planning keeps examples inline. Continuations use the same
production planner in both arms, so count foreground repairs separately from
the initial proposal. The trace records lookup use and all replies; `ms`
includes the whole initial planning session and `totalMs` includes play.

The first gate is three repetitions each of `red-ready-lethal` and
`red-blocked-lethal-fresh`, with physical play through their own turn. Require
three clean wins per case, no foreground repair, zero gaps/fallback and matching
replay/clone, plus improvement over the paired control. Record a winning initial
line that Jev fails to execute as generation success and execution failure.
Neither acceptance nor a shorter request passes the gate. Only after Red passes
should feasible supplied Green defenses establish the development/defense gate;
no full game precedes both gates. Attack-disposition schemas remain unadopted.

`--play` installs the answer in a clone (or retains existing work for a
`continue` case) and continues through the opponent's
next turn, or an earlier outcome, using the ordinary Jev/Luna roster with summary
off. `--through N` changes that diagnostic boundary. It checks the cloned prefix
before installing the plan and replay after play, and saves a separate game
journal, call trace, report and timeline. A stopped continuation is not an outcome.
Planning time and usage remain separate from the continuation's report.
`--decisions N` stops a continuation after N recorded decisions following the
prefix, counting forced and delegated rows as well as seat choices. The report
names `stoppedBy`, `decisionLimit` and the actual count. This is an external
observation boundary, not a seat action, outcome, gap or fallback. A stopped
declaration remains pending. The production loop has no such cap.
To execute an existing answer without paying for another planning question:

```sh
npm run benchmark -- --live --case after-explorer-repair --play --answers .pi/benchmarks/example/results.json --out .pi/benchmarks/example-play
```

`--answers` requires exactly one matching case, arm and repetition. Use the
original `--arm one`, `two` or `both` to continue generated candidates.
`--repeat` selects
successive recorded repetitions; it does not repeat the first answer silently.
Both new and saved-answer continuations require `--live` because play uses models.

Checks are deliberately narrow. Pilot cases compare a listed id or a use's
source, timing and target. Plan cases require or forbid named actions in the
ordered line, or require their relative order. These checks do not establish
correct phase guidance, combat quality, conditional execution or game strength.
Read the accepted answer as well as the pass count.

`--arm one` and `--arm two` run the shared candidate experiment on current-turn
planning cases. `--arm both` alternates their order by repetition. Both arms use
the same facts, action catalogue, receipts, roster and output ceiling. Candidates
register through an informational tool; final selection names an immutable id
whose receipt was returned on an earlier reply. Three replies cover registration,
repair and selection. Exhaustion records failure and selects nothing.

The experimental compiler derives instructions for the remaining own precombat
main, attacker declaration and postcombat main. Luna explicitly supplies
completion, response, trigger, target and exception policies. An empty list
grants no permission to pass. Reasons remain in results and never enter pilot
guidance. Other windows retain production behavior; this is not a production
default. Receipts describe current creatures and resources and proposed entries,
not a simulated future battlefield. Payments remain examples.

Four `plan` cases preserve October 7 prefixes immediately before the accepted
plan at their recorded version. They therefore contain the prior policy and
position, but not the bad answer being tested. The input files are ordinary
compressed journals, replayed by the same reader as every other case.

```sh
npm run benchmark -- --live --arm both --repeat 3 \
  --case red-blocked-lethal --case after-explorer-repair \
  --case red-two-red-mana --case green-tapped-vein \
  --case green-upkeep-fetch --case red-treasure-lethal \
  --case green-landfall-order --case red-established-attacker \
  --out .pi/benchmarks/candidate-comparison
```
Order uses the first matching step and does not inspect `may` branches. A
`prefix` matches a movement selector, not a procedure. Repeated land drops and
conditional lines need a more specific property before they can be scored.
`require` checks every named action without ordering those actions relative to
each other. Requiring the other attackers prevents a Smaug-only attack from
passing the blocked-lethal case; it does not calculate an arbitrary attack's
damage or prove that the proposed payment leaves those attackers untapped.

`forbidProse` holds case-specific regular expressions over objective, guidance,
phase text, labels, purposes and holds, excluding executable card definitions.
Results record structural success and matched text separately. A text match is
a wording failure for that fixture, not proof of a false fact: conditional and
negative statements can match too. Review the matched text before comparing
arms. These checks never reject a plan during a game.

For broad planning comparisons, run the planning cases at least three times per
arm. Preserve the source revision or patch with the results. Compare acceptance,
structural properties, reviewed prose, refusal kinds, calls and elapsed time;
an isolated perfect answer is not evidence of an improvement.

`--arm receipt-paired` compares one repair of the same frozen production plan
with and without a reviewed, hash-bound counterexample. It requires
`--repair-source` and `--receipts`; all selected inputs are validated before
inference. The [diagnostic contract](../../docs/history/2026-10-07-consequence-feedback.md)
defines the receipt, reply budget, scoring and rejection gate. This is a
benchmark experiment, not a production default or an automatic outcome reader.

Saved plan answers can be checked again without a model call:

```sh
npm run benchmark -- --case green-landfall-order --review test/fixtures/benchmarks/good-landfall.json
npm run benchmark -- --case green-landfall-order --review test/fixtures/benchmarks/bad-landfall.json
```

The first recorded answer passes the beneficiary-before-land property. It also
names an absent protection card, so the added prose check flags it. The second
fails both checks. `--review` prints the structural and prose results separately
and accepts the
runner's results and the older component runner's named plan answers. It
requires an answer for every selected case and cannot be combined with `--live`.

`--task judge` runs a cited ruling against a frozen declaration without moving
the table. Judge cases name the contested row and expected legality. Pilot cases
can separately expect an objection or measure avoiding one.

`--play --judge-attempts N` stops after N actual judge attempts, including failures
and successful rollbacks. This external probe boundary complements `--decisions`,
whose net ledger growth can shrink on rollback. Reports retain the stopped
position and separate `judge-attempts` from outcomes, gaps and recovery.
