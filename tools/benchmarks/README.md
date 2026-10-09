# Saved-position benchmarks

Use `--positions FILE` for a local manifest under `.pi/`. New run inputs and
results belong there; only reusable invariant fixtures belong in Git.

`npm run benchmark` replays the cases in `positions.json` without model calls.
Each case names a journal prefix, seat, task and expected property. Compressed
journals in `test/fixtures/benchmarks/` are expanded into a temporary directory
and removed on exit. Missing inputs fail explicitly.

Use `--case ID` to select cases and `--out PATH` for a new results directory.
`--live` spends on the configured models. The production arm uses the ordinary
planning and pilot paths; it is the default. Preserve the roster and record
model, effort and summary settings when comparing runs.

```sh
npm run benchmark -- --case red-ready-lethal
npm run benchmark -- --live --case red-ready-lethal --out .pi/benchmarks/ready
```

For pilot comparisons, repeat `--pilot` with available Pi classifier patterns.
Both models receive the same packet; order alternates across cases. `jev` uses
the baseline classifier; `luna` is the older chat-pilot control, not Decisions.

```sh
npm run benchmark -- --live --task pilot --pilot jev --pilot openai/gpt-6-luna-decisions --out .pi/benchmarks/decisions
```

## Continuations

`--live --play` installs an accepted answer in a clone, or preserves existing
work for a `continue` case. It plays through the opponent's next turn unless an
outcome occurs first. `--through N` selects another turn boundary.

`--answers FILE` plays saved answers without generating replacements. Entries
must match case and repetition. An unresolved answer is not silently
replaced. `--review FILE` checks saved plans offline and cannot use `--live`.

`--decisions N` bounds recorded decisions after the prefix, including forced
and delegated rows. `--judge-attempts N` separately bounds judging across
rollbacks. These are external observation stops, not seat choices or outcomes.
The paused table remains at the stop, including an unfinished declaration.

## Results

`results.json` contains accepted answers, property checks and usage.
`calls.jsonl` contains complete requests and replies. Physical continuations
also save their journal, report and timeline, checking the initial clone and
final replay. Keep initial planning costs separate from continuation costs.
`continuationPassed` reports the physical property and health separately from
the plan-pattern check. An alternative winning line can fail the expected
pattern and pass its continuation. `replacementPlans` names later accepted
plans for the tested seat, including ones later rolled back. Inspect those
changes before crediting the initial plan with the eventual result.

Each result also records `work`: the accepted analyst reports and writer
submission, or each task's failure. Use these to distinguish missing candidates,
selection errors and commitments lost while writing. They are evidence for a
review, not automatic strategic scores. Attribute fact, pilot and execution
failures from the projected request and physical continuation separately.

`--findings FILE` reuses that results file's analyst tasks for a live writer
comparison. Case, repetition, projected position and analyst task coverage must
match, and successful reports must still satisfy their submission contract.
A missing or incompatible report stops before the writer spends; recorded
analyst failures stay failed. Reused work is marked and costs no new call;
the writer is asked normally. This isolates writing changes from new analyst
samples. It cannot combine with saved plan answers or pilot, judge and
continuation-only cases.

A runner PASS establishes only its listed property. Review strategic choices,
policy obedience, legal play, help and repairs separately. Record external
stops, refusals, canceled calls and missing usage explicitly. Repeated identical
pilot packets measure score stability rather than independent success rates.

The authoring cases require a structured hold. `response-authoring` also
requires an opponent phase policy with no step or phase restriction. These
checks establish presence and scope, not whether the payment or response works.
Cases without property checks grade only acceptance and continuation health.

The growth cases check the initial accepted plan, before pilot actions or
repairs. `anyOrder` lists alternative ordered sequences. A match establishes
the listed source, cost and window choices; it does not check targets, payment
instructions or power arithmetic. Review those separately. With `--play`, the
plan property, winner and continuation health must all pass.

Physical `after` checks name object ids, final zones and optional incarnations.
They require `--live --play` and a completed turn boundary or actual outcome.
A decision or judge limit reached earlier cannot pass them. `throughTurn` in
the case sets its boundary; `--through` overrides it. A boundary before the
prefix is refused. These checks establish the final state, not the payment,
timing or tactical value of the actions that produced it.

`k-preserve-elf-response` retains the Elf through turn 4,
`l-hydra-response` puts Hydra in the graveyard through turn 9, and
`kellan-reserve-continuation` puts the planned Zhao on the battlefield through
turn 4. The two repair prefixes end at `plan.request`, before the writer's
answer, including equipment edits recorded at the same decision version.

Retired experiments remain in Git history. Local notes live under ignored
`design-ref/experiments/`. See [gameplay status](../../docs/STATUS.md).

## Pilot lab

`--corpus` re-asks the pilot about real logged decisions under the code in this checkout.
Jev is cheap and fast, so the lab runs hundreds of decisions with repeats in a few minutes.

```sh
node tools/benchmark.ts --corpus build GAME_DIR... --out .pi/jev-lab/corpus.jsonl
node tools/benchmark.ts --corpus run --items .pi/jev-lab/corpus.jsonl --only IDS --repeat 5 --arm NAME --out DIR
node tools/benchmark.ts --corpus report DIR... --items .pi/jev-lab/corpus.jsonl --gold GOLD
```

`build` reads a game's journal and calls log. Each decision is one item: one seat's requests at
one clock until a choice ends it. An item is kept only if this checkout rebuilds its first
request byte for byte, so the lab asks exactly what the game asked. Work the seat recorded later
at the same decision, such as its own help request, is cut from the rebuilt position.

`run` builds each item's frame as the game loop does and runs the whole decision through the
seat's own loop with the live classifier, inspection stages, trigger order questions and rule routes included. It records
every stage's options, probabilities and model. `report` scores runs against a gold file of
acceptable answers per item and lists steady control answers that changed. Gold labels state what
carries out the plan; a pick is never a verdict on playing strength.

`pilot-future-step` preserves a known schedule departure through the full
inspection sequence. Its expected pass measures the supplied plan's timing,
not the legality or strategic value of an earlier instant cast. Offline
prefix validation does not establish that this live property passes.
