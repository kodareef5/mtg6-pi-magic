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

Own-turn and preparation answers must explicitly replace or keep their steps
and opponent-turn policy. Omission is refused, and keep preserves the displayed
base exactly before expansion into an ordinary journaled plan. Of 175 archived
answers accepted by the old writer, 171 expand identically and four omissions
are now refused. Six frozen-report sessions per arm used eight writer calls for
control and seven for the change, with no analyst reruns. Both development
continuations replayed and cloned without gaps or replacement plans. No live
answer used keep; its fidelity is covered offline. Explicit intent does not
fix contradictory reasoning or establish stronger play.

## Completed comparisons

No tested prompt simplification has established stronger play. Keep the current
production prompts while replacing the failing handoff with a measured capability.

- Broad context trimming cut dossier bytes by 24.8%; calculation-only trimming
  cut them by 59.8%. Both lost useful prepared understanding or execution.
  Removing only pilot step notes saved 9.8%, but its six writer sessions used
  ten calls against seven and lost a supplied growth sequence.
- Separate choose and write calls used 44 calls against 21, added failures and
  lost commitments. Three narrower analyst questions saved calls but missed
  both Hydra wins in their screen.
- A win/survival/development objective kept two blockers twice against once for
  control, but won four of eight immediate-win continuations against five.
  That is a tradeoff on inspected positions, not a general strength result.
- Optional checked fragments were unused in all 18 accepted writer answers.
  Stop there: a downstream rewrite cannot test a copy operation nobody selected.
- Writing the plan before a short rationale used 11 writer calls against 13
  across nine positions, with identical frozen reports and no new analysts.
  It lost supplied growth sequences and retained an impossible payment.
  Acceptance and output order do not establish good choices.

Pilot tap annotations and earlier automatic combat-fact attachments also failed
their comparisons. Do not repeat them or add another warning for a named card.
Raw results and rejected patches remain in the local evidence directory.
Repeated unchanged controls also chose different actions. A single changed
answer can locate a failure, but is too noisy to veto a mechanism's playing
quality. Finish a fixed repeated comparison before drawing that conclusion.

## Rehearsal implementation and result

The writer sometimes receives the useful line and still chooses a worse one.
It also cannot reliably calculate the board its own casts and triggers create.
The isolated rehearsal prototype supplies those consequences through the existing engine.
It does not add another analyst or another manual recount.

The reader starts from an earned projection, uses shared engine operations and
returns the checked prefix plus its first unresolved boundary. It never chooses
payments, responses, attacks or blocks. Named searches assume a registered card
remains; they do not discover its hidden identity. Unknown draws, mills, missing
history and unprepared meaning stop the checked prefix. The failed writer
submitted an ordinary plan plus a separate scenario script and adopted a
session-local draft id after preview.

Offline coverage passed for 65 projected prefixes and 1,720 concrete choices,
nine archived plans and 122 choices, then six consequential witnesses and 180
choices. Receipts and resulting states matched physical execution; hidden
permutations changed nothing and the real inputs remained unchanged.

The fixed screen then completed all 48 writer sessions and scheduled
continuations. Control achieved six unassisted physical successes out of 24;
the candidate achieved none. Control accepted 23 plans using 30 writer calls;
the candidate accepted two using 91. Of 39 candidate previews, 37 stopped on
script syntax and only two computed any choices, 19 in total. Both adopted
plans matched their drafts exactly. One candidate eventually won after two
replacement plans, which does not count as initial-plan success.

The added authoring contract failed. It required the writer to serialize both
an ordinary plan and a separate hypothetical script, then adopt an id. Schema
errors consumed its single revision. Correct offline simulation does not show
that this interface helps the strategy model, and this trial supplied too few
computed previews to measure simulation's strategic value.

Keep the prototype isolated. Do not promote it or run its fresh-game gate.
Preparation and response repair stayed unchanged. Writer median/p95 elapsed
time rose from 16.0/35.1 seconds to 27.3/85.7 seconds. Collection and the entire
screen reported $0.804 across 1,899 requests; 423 requests lacked usage, mostly
canceled background work, so the cost is a lower bound. All 25 physical
continuations replayed and cloned without new gaps or fallbacks. Review found
no material illegal play in their new selected actions; that does not certify
the inherited positions or every card interpretation.

The next interface must first demonstrate that the model can submit and inspect
a consequential line without maintaining two descriptions of its execution.
An interface usability check precedes another strategic comparison. Keep the
simulation's information boundary and exact-adoption guarantee; a formatting
repair is not a strategic revision. Do not tune the completed screen or count
its inspected positions as fresh confirmation.

## Next implementation: construct the line through choices

One Luna-low planner constructs a hypothetical line through listed choices.
Each answer records its source, accepted use, payment, targets and timing, and
core computes the next position before the following question. That same
structural record supplies Jev's marks and instructions. No model rewrites the
selected line. Existing objects use exact references; future objects use
explicit provenance from a prior action or conditional search. An ambiguous
binding or changed prerequisite stops instead of choosing another source.

This replaces the own-turn analyst wave, prose calculations and whole-plan
writer at the supported post-draw checkpoint. Keep the pregame advice initially.
Preparation, upkeep acceptance and response authoring retain their current paths
until projection supports their checkpoints. Core owns all hypothetical motion,
compulsory operations and explicitly stated scenario assumptions; context only
asks and renders. Jev still chooses every real voluntary action and pass.

Development is inspected through the end step. Attack-dependent claims include
supplied opposing blocks; defense includes the stated following attack and
expiry of temporary effects. Unknown continuations remain unknown. The planner
may return to one earlier checkpoint it names and build an alternative. An
invalid format retries the current question within the request budget and does
not spend that strategic revision. Code neither proposes nor ranks lines.

For example, a development sequence selects a land, creature and payment, then
inspects the end-of-turn board. A growth sequence chooses payment, land entry,
trigger order and search at separate questions; the next question carries the
computed creature and resource facts. If a spent source was needed later, the
planner can revisit that payment. Acceptance preserves those exact choices.

## Fixed comparison and retention

First prove offline fidelity against the existing witnesses and audits. Include
changed equipment indices, duplicate names, zone changes, conditional search
bindings, stale prerequisites, hidden permutations and unchanged real inputs.
Recorded intent must survive journal, replay and clone, with progress derived
from physical ledger rows. Every original physical option remains available.

Then run twelve known-line sessions: six positions twice, with the complete
intended line supplied. Require at least eleven faithful constructions, every
case succeeding at least once, and eleven scheduled physical executions without
replacement plans. Jev chooses for both seats under the supplied scenario
policies; record deviations. This tests usability, not discovery. Do not buy
another comparison against the failed script interface.

A passing interface reaches a fresh strategic screen: twelve positions, two
repetitions per arm, 48 sessions and scheduled continuations. Cover immediate
wins, visible defense, lasting development and resource preservation across
source games; use held-out prefixes where available. Control runs its ordinary
analysis anew. Candidate receives no frozen reports. Freeze inputs, properties,
acceptable alternatives and spend/request limits before inference. Both arms
have 32 strategy requests and 300 seconds per session, retries included, plus
equal physical continuation limits. A limit is an incomplete result, not a pass.

Advance only with four additional unassisted successes out of 24, gains across
at least two position types, and no position losing both matched outcomes that
control successfully achieves. Fewer than twenty candidate acceptances is an
interface failure diagnosis, not a reason to add rescue repetitions. Finish
ordinary model failures in the fixed batch. Stop for a new leak, real mutation,
false computed consequence, binding/adoption defect or replay mismatch.

Measure discovery, construction, retained commitments, Jev obedience, repairs
and legality separately. A repaired win is not an initial-plan success. Record
revision uptake and scenario assumptions; an unused revision proves nothing.
All requests process input, including cached history. Report calls, tokens,
cost and median/p95 waits rather than assuming one conversation means one read.

Before retaining the replacement or claiming stronger play, run eight fresh
paired seeds with balanced decks and starting players. Review missed wins,
avoidable losses, legality, repairs and obedience alongside outcomes and waits.
Inspected positions are never fresh confirmation. Remove superseded paths when
retaining a replacement. If a usable single planner repeatedly misses lines
that control finds across position types, compare broader discovery using the
same construction primitive; do not add a permanent second strategy mode.

Keep opponent-turn preparation, scoped upkeep acceptance and post-draw review.
Do not narrow amendments yet: 67 of 84 inspected draw reviews changed actions
or steps, and earlier narrow reviews retained stale advice. Reset, rollback and
close must still cancel stale jobs. `npm test` and `npm run check` must pass
before committing.

Local evidence is in `.pi/process-improvements-20261009/` and
`design-ref/process-review-20261009.md`. The offline rehearsal prototype and
its coverage report are kept there until the integration gates are met.
