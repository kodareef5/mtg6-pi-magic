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
tasks must match. Failed reports remain failures; only new calls are billed.

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

The choose/write split reused A's analyst findings. It needed 44 new calls
against A's 21 writer calls, used 38% more writer input, and produced two
infrastructure failures in 16 attempts. It chose unpayable lines and sometimes
dropped commitments while writing. Its 20.0 s median excludes analyst work.
Reject this implementation. Adding a sequential call did not fix selection.

Three concurrent attack, survival and development questions reduced peak
requests per session from 19 to 3. They also lost candidate coverage: both
Hydra generations missed the win, while three of four controls found it. Reject
this implementation too. Do not replace the existing wave for call savings alone.

## Rejected context trim

The prototype gave strategy a brief's structured policies with their complete
applicable priorities, reserves and reversing conditions, plus the objective,
role, visible card notes and preparation gaps. Supporting route, matchup,
traps, recovery and pilot step essays stayed available through a lookup.
Legacy briefs kept their prose; carried preparation and pilot packets were
unchanged. Current physical facts, restrictions and visible card text stayed
complete.

Across 77 saved positions it removed 24.8% of dossier bytes with all physical
facts byte-identical. The live development screen used about 18% fewer input
tokens. It established no latency or price gain: cache usage differed, and the
cleanup cost more in that batch.

Four saved first plans per arm were then played through their own turns. The
cleanup won both tactical positions that control A missed, without replacement
plans. One win used a valid alternative rejected by the expected move pattern.
But both cleanup generations also proposed a losing Kellan attack, compared
with one of four controls. Its analyst got the exchange wrong; the writer
corrected the arithmetic while retaining the attack. Holding A's correct
reports fixed made both cleanup writer generations keep Kellan safe. That
localizes the observed failure without proving the cleanup harmless.

All eight development continuations matched their initial clone and final
replay, with no gaps or fallback choices. Turn boundaries canceled background
preparation; missing usage makes their reported costs incomplete.

Four unused positions from one other source game then tested development,
tapped entry, casting from exile and survival. In the tapped-entry position,
the trim reused a land already spent on casting, then misread menace. Its
continuation needed a replacement plan and dealt no damage; the control dealt
10 without replanning. Both arms failed to retain enough blockers in the
survival position. All eight clones and replays matched with no gaps or
fallbacks. The health checks alone would have hidden those strategic failures.
Reject the broad trim and restore the original context. Token savings did not
satisfy the dependency and execution requirement.

## Next experiment: verify candidate assumptions before selection

Use the existing projected combat arithmetic and payment facts as evidence
beside candidates. A model should compare lines without recalculating a known
single-block exchange from prose. Start with the existing combat helper and
lookup; test surfacing its scoped result to analysts. Do not build another
rules interpreter, infer card meaning, or silently decide for Jev. Multi-blocks,
responses, triggers and future characteristics remain outside that helper.

Freeze two comparisons: candidate discovery with identical facts and preparation,
and selection/writing with identical reviewed reports. Cover profitable and
losing exchanges, first strike, trample, resource conflicts, tapped entry,
summoning sickness, growth dependencies and visible next-turn losses. Preserve
every accepted use and move id. Retain the change only if it improves feasible
choices across positions, rather than teaching one named card interaction.

Only then reconsider a choose/write split or fewer analyst questions. The
writer should either preserve a selected commitment or report why it cannot
bind it. Reducing overlapping jobs must preserve the combinations found by the
removed work. Bound concurrency across both seats only after measuring active
response latency against background preparation; peak request count alone is
not a performance result.

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

Before claiming stronger play, run fresh paired seeds with deck assignments
and starting player balanced. An initial eight pairs is a screen. Review missed
wins, avoidable losses, legal play, repairs and obedience alongside outcomes,
then report calls, input, output, cost and median/tail strategy waits. Remove
superseded paths when retaining a replacement. Both `npm test` and
`npm run check` must pass before committing.

The measurement changes are retained; the three planner prototypes remain out
of normal gameplay. Detailed experiments, patches and calls are in ignored
`.pi/process-improvements-20261009/`; the initial review is in
`design-ref/process-review-20261009.md`. These local artifacts are evidence for
this round, not prerequisites for ordinary play.
