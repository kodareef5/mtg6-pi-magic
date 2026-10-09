# Strategy process improvements

October 9. Improve how often a sound line becomes coherent play across different
positions. Keep Jev, Sol 6.1 high for pregame, and Luna low for strategy, judge
and summary. [Plans](PLANS.md) remains the gameplay contract; this document
records the process experiments and the next work.

The review found ample concurrency already: 30 to 35 simultaneous strategy
requests at peak in recent games. Initial analysts read a median 33 KB of
pregame advice; coordinator requests reached a median 137 KB. Strategy waits
occupied about 78% of elapsed play in the four reviewed games, including one
stopped game. The problem is repeated reading, unreliable candidate analysis,
and decisions lost between analysis and execution. More parallel specialists
alone do not solve those failures.

## Implemented measurement

The existing benchmark runner now records each analyst answer or failure and
the writer's submission. `--findings FILE` reuses the exact analyst reports for
an isolated writer comparison. Case, repetition, projected frame and analyst
tasks must match. Successful reports must satisfy the current report contract;
an incompatible fixture stops before writer inference. Recorded analyst failures
remain failures; only new calls are billed.

Saved-plan continuations now report the physical property separately from the
expected move pattern. They also identify later accepted replacement plans,
including plans later rolled back. An alternative winning line can fail the
pattern, and a win after repair cannot establish that the initial plan worked.
The runner checks clone and replay parity. See [benchmark usage](../tools/benchmarks/README.md).

Review the earliest failure in six stages: facts, candidate discovery, selection,
writing, pilot execution, and card meaning or engine execution. Record later
independent failures too. Acceptance, legality and playing strength need separate
evidence; unknowns stay unknown. No new evaluation service is needed.

## First comparison

Eight development positions, two generations each, with unchanged controls run
twice. All arms used the same carried preparation, model settings and disabled
summaries. Repetitions do not create independent positions.

| Arm | Calls | Input tokens | Median session | Plan-pattern matches |
| --- | ---: | ---: | ---: | ---: |
| Original A | 291 | 4,452,943 | 38.8 s | 8/16 |
| Original B | 290 | 4,397,095 | 29.5 s | 9/16 |
| Policy context | 294 | 3,620,164 | 38.8 s | 9/16 |
| Three questions | 75 | 1,529,688 | 28.3 s | 9/16 |

These matches establish narrow structural properties, not good play. The
three-question arm missed a known winning line twice, despite matching the
control's aggregate pattern count.

The choose/write split reused A's findings: 44 new calls versus 21 writer calls,
38% more input, two infrastructure failures, unpayable lines and dropped
commitments. Its 20.0 s median excludes analysts. Reject this implementation.

Three attack, survival and development questions reduced peak requests from
19 to 3 but missed both Hydra wins; three of four controls found them. Reject
this implementation. Call savings alone do not justify losing coverage.

## Rejected context trim

The prototype supplied complete applicable policies, objective, role, visible
card notes and preparation gaps, with supporting essays behind a lookup.
Legacy briefs, pilot packets, physical facts and visible card text stayed intact.

Across 77 saved positions it removed 24.8% of dossier bytes with all physical
facts byte-identical. The live development screen used about 18% fewer input
tokens. It established no latency or price gain: cache usage differed, and the
cleanup cost more in that batch.

Four first plans per arm were played through their own turns. The cleanup won
both tactical positions that control A missed, without replacement plans; one
used an alternative rejected by the expected pattern. But both cleanup answers
proposed a losing Kellan attack versus one of four controls. The writer corrected
its analyst's arithmetic while retaining the attack. With A's reports fixed,
both cleanup writer generations kept Kellan safe. This localizes that failure.

Four unused positions from one other source game then tested development,
tapped entry, casting from exile and survival. In the tapped-entry position,
the trim reused a land already spent on casting, then misread menace. Its
continuation needed a replacement plan and dealt no damage; the control dealt
10 without replanning. Both arms failed to retain enough blockers in the
survival position. All eight clones and replays matched with no gaps or
fallbacks, as did the eight development continuations. Missing usage from
canceled background preparation makes their reported costs incomplete.
Reject the broad trim. Token savings did not preserve coherent execution.

## Resource checks and the next process experiment

The payment forecast now preserves checks before an unknown continuation. Known
mana and tap costs can refute a step without claiming its other costs were checked.
Across 86 plans this recovered 20 complete payment witnesses and one conflict.
Retain the truthful forecast; its live comparison established no strength gain.

A separate pilot annotation for sources needed by later tap costs did not
improve four paired continuations. Leave it out. Automatically attaching combat
exchange facts was already tested and removed in October 6 and 7 experiments;
correct arithmetic did not repair candidate selection. Keep the existing lookup.

A branch-objective prototype kept the existing parallel coverage, asked for
win, survival and development continuations, added a defense report, and removed
ranking by claimed damage. Nine development positions, two generations per arm:
both used 322 calls, with medians 29.7 seconds for candidate and 31.0 for control.
Candidate output increased; the screen established no efficiency gain.

All 24 saved-plan continuations had matching clones and replays, no gaps and no
fallbacks. The candidate kept the needed blockers in both survival runs versus
one of two controls, with one later replacement plan overall versus four. But
it won four of eight immediate-win continuations versus five for control.
Leave this prototype out. These repeated positions show a tradeoff, not stronger
play. Continuation costs exclude 270 canceled calls with missing usage.

Next, make the handoff preserve action and resource commitments. A coordinator
can calculate a winning attack and omit it from the plan, or name an attacker
while telling Jev to tap it for mana. Prototype candidates built from accepted
action keys, with selected order and payment commitments carried into the plan
without another prose translation. Use existing plan checks and the scoped
resource forecast; expose commitments that cannot be bound. This still cannot
certify card meaning or predict responses. Keep every physical choice with Jev.

Compare candidate feasibility, preservation into accepted plans and execution
with fixed evidence before another prompt split or reduction in analysts.
Preserve candidate coverage. Bound concurrency only after measuring active
response latency against background preparation; peak count alone proves little.

Keep opponent-turn preparation, scoped upkeep acceptance and post-draw review.
Do not narrow amendments yet: earlier narrow reviews retained stale advice,
and 67 of 84 inspected draw reviews changed actions or steps. Changed blockers,
response mana, source availability, relevant draws and resume without cached
work must be covered before reusing findings. Reset, rollback and close cancel
stale jobs; late answers cannot install plans.

## Retention rule

State the properties, acceptable alternatives, source-game split and live-call
budget before a run. Verify the prefix ends before the planning answer, including
work recorded at the same revision. Run an unchanged control twice; change one
process decision at a time. Keep errors and incomplete usage in the report.
Do not turn inspected development cases into fresh confirmation.

Before claiming stronger play, run fresh paired seeds with balanced decks and
starting players. Eight pairs is a screen. Review missed wins, avoidable losses,
legal play, repairs and obedience alongside outcomes,
then report calls, input, output, cost and median/tail strategy waits. Remove
superseded paths when retaining a replacement. Both `npm test` and
`npm run check` must pass before committing.

Retained changes are measurement and truthful prefix checks. Local evidence is in
`.pi/process-improvements-20261009/` and `design-ref/process-review-20261009.md`.
