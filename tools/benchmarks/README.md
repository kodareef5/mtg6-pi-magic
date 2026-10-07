# Saved-position benchmarks

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

A runner PASS establishes only its listed property. Review strategic choices,
policy obedience, legal play, help and repairs separately. Record external
stops, refusals, canceled calls and missing usage explicitly. Repeated identical
pilot packets measure score stability rather than independent success rates.

Retired experiments remain in Git history. Local notes live under ignored
`design-ref/experiments/`. See [gameplay status](../../docs/STATUS.md).
