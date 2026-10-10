# Strategy process improvements

October 9. Improve how often a sound line becomes coherent play across different
positions. Keep Jev, Sol 6.1 high for pregame, and Luna low for strategy, judge
and summary. [Plans](PLANS.md) remains the gameplay contract.

The review found ample concurrency already: 30 to 35 simultaneous strategy
requests at peak. Initial analysts read a median 33 KB of pregame advice;
coordinator requests reached a median 137 KB. Strategy waits occupied about
78% of elapsed play in the four reviewed games, including one stopped game.
The problems are repeated reading, unreliable candidate analysis, and decisions
lost between analysis and execution. More parallel specialists alone do not
solve them. No general playing-strength gain has been established yet.

## Retained changes

The existing benchmark runner records each analyst answer or failure and the
writer's submission. `--findings FILE` reuses exact reports for an isolated
writer comparison. Case, repetition, projected frame, task coverage and report
contract must match. Incompatible fixtures stop before writer inference;
recorded analyst failures remain failures. Only new calls are billed.

Saved-plan continuations report the physical property separately from the
expected move pattern and identify later replacement plans, including rolled
back ones. An alternative winning line can fail a pattern. A win after repair
does not establish that the initial plan worked. Clone and replay parity are
checked. See [benchmark usage](../tools/benchmarks/README.md).

The payment forecast preserves checks before an unknown continuation. Known
mana and tap costs can refute a step without claiming its other costs were
checked. Across 86 saved plans this recovered 20 complete prefix witnesses and
one conflict. This is a correctness gain, not a measured strength gain.

## What the comparisons ruled out

- A broad policy-only context trim cut dossier bytes by 24.8% across 77 saved
  positions, but failed confirmation on resource dependencies and execution.
  Token savings alone did not justify retaining it.
- Separate choose and write calls used 44 new calls versus 21 writer calls
  with fixed findings, added failures and lost commitments. Leave them out.
- Three attack, survival and development questions used 75 calls versus about
  290, but missed both Hydra wins in the development screen. Keep coverage.
- A win/survival/development branch objective preserved blockers more often
  but won four of eight immediate-win continuations versus five for control.
  Those repeated positions showed a tradeoff, not stronger play.
- Checked candidate fragments with an optional copy selector added authoring
  work: 406 calls versus 322 in the prior control, and 30 failed branch reports.
  None of 18 accepted writer answers selected a fragment, despite 64 successful
  fragments. Reject the unused mechanism. The planned downstream rewrite and
  physical comparisons were not run because no copy operation occurred.

Pilot annotations for later tap costs did not improve four paired continuations.
Automatic combat-fact attachments already failed in October 6 and 7 experiments.
Do not repeat those approaches or turn a failed position into another card warning.
Detailed evidence and rejected patches stay outside the production paths.

## Next change

Separate reading by the question being answered. First-action and growth calls
calculate consequences this turn; test giving them the full projected position
without repeated pregame advice. Keep that advice with focused strategic
questions and the coordinator. Preserve card text, accepted terms, public deck
counts, earned knowledge, restrictions, candidate coverage and every physical
choice. Response repair and the pilot stay unchanged. This isolates a smaller
change than the rejected trim of every strategy reader.

Compare discovery first, then selection and physical execution. Use frozen
findings to isolate the writer when needed. Do not add another selector or
review stage until evidence identifies work it can remove. Measure active
response latency against background preparation before changing concurrency;
peak count alone proves little.

Keep opponent-turn preparation, scoped upkeep acceptance and post-draw review.
Do not narrow amendments yet: 67 of 84 inspected draw reviews changed actions
or steps, and earlier narrow reviews retained stale advice. Changed blockers,
response mana, source availability, relevant draws and resume without cached
work must be covered before reusing findings. Reset, rollback and close cancel
stale jobs; late answers cannot install plans.

## Evidence required to retain a change

State properties, acceptable alternatives, source-game split and live-call
budget before a run. Check that the prefix ends before the planning answer,
including work at the same revision. Use repeated unchanged controls, change
one process decision at a time, and retain errors and incomplete usage.
Inspected development positions are never fresh confirmation.

Locate the earliest failure in facts, discovery, selection, writing, pilot
execution, or card meaning and engine execution. Record later independent
failures too. Acceptance, legality, playing strength and efficiency need separate
evidence. A mechanism that is unused need not advance to more paid comparisons.

Before claiming stronger play, run fresh paired seeds with balanced decks and
starting players. Eight pairs is a screen. Review missed wins, avoidable losses,
legal play, repairs and obedience alongside outcomes, then report calls, tokens,
cost and median/tail strategy waits. Remove superseded paths when retaining a
replacement. `npm test` and `npm run check` must pass before committing.

Local evidence is in `.pi/process-improvements-20261009/` and
`design-ref/process-review-20261009.md`.
