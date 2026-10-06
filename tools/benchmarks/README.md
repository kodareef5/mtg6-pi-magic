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

Pilot cases use the actual seat context and inspection path. Luna receives the
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
`zone` matches a projected source in that zone; it does not assert that a future
zone change or permission has happened.

The runner records each answer, property result, whole-decision duration,
individual calls, model, effort, tokens, cost and complete request/response
trace. Repeated pilot comparisons alternate model order. `results.json` holds
the answers and metrics; `calls.jsonl` holds the trace. Use a new output
directory for each run. Any failed property or call makes the command fail.

Checks are deliberately narrow. Pilot cases compare a listed id or a use's
source, timing and target. Plan cases require or forbid named actions in the
ordered line, or require their relative order. These checks do not establish
correct phase guidance, combat quality, conditional execution or game strength.
Read the accepted answer as well as the pass count.
Order uses the first matching step and does not inspect `may` branches. A
`prefix` matches a movement selector, not a procedure. Repeated land drops and
conditional lines need a more specific property before they can be scored.

`forbidProse` holds case-specific regular expressions over objective, guidance,
phase text, labels, purposes and holds, excluding executable card definitions.
Results record structural success and matched text separately. A text match is
a wording failure for that fixture, not proof of a false fact: conditional and
negative statements can match too. Review the matched text before comparing
arms. These checks never reject a plan during a game.

For planning comparisons, run all six planning cases at least three times per
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
