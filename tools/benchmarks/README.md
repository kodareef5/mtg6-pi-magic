# Saved-position benchmarks

`npm run benchmark` replays the positions in `positions.json` without model
calls. Each case names a journal, decision-prefix version, seat and expected
property. Compressed journal prefixes and accepted preparations are committed
under `test/fixtures/benchmarks`, outside the published package. The runner
expands them in a temporary directory and removes those copies on exit. A `.pi`
cleanup no longer deletes the inputs. Missing artifacts fail explicitly.

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
The held-vigilance case preserves a plan whose listed attack and preservation
prose disagree. Correct consumption marks alone do not prove it will execute.
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

`--play` installs the answer in a clone and continues through the opponent's
next turn, or an earlier outcome, using the ordinary Jev/Luna roster with summary
off. `--through N` changes that diagnostic boundary. It checks the cloned prefix
before installing the plan and replay after play, and saves a separate game
journal, call trace, report and timeline. A stopped continuation is not an outcome.
Planning time and usage remain separate from the continuation's report.
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
