# Gameplay status

Jev remains the pilot, Sol 6.1 high prepares the matchup, and Luna low writes
strategy and handles judging. Strategic quality remains unresolved. No model
upgrade or coded lethal search is part of the current work.

Retired experiment hooks, fixtures and tools have been removed. Combat pair
arithmetic remains available through lookup. An accepted plan can now survive
its covered rules draw without another writer call when the position otherwise
matches. Missing coverage or a changed position still requires the writer.

Four new seeds finished with zero recorded gaps or fallback and matching replay
and clone checks. They also exposed missed attacks, false tactical claims and
substantial strategy waiting. These are completed games, not a playing-strength
or comprehensive legality pass. Draw reuse occurred twice; one illegal menace
block was challenged, rolled back and corrected by the defending seat.

Three task-decomposition prototypes failed their comparison and were removed.
No failed prompting arm remains in production. The current checks pass all 181
invariants; an unused phase-planning predicate and its obsolete test were deleted.

Claude's tuning round on October 7 kept two changes. A sound background
preparation is installed at a plain upkeep without a writer call, and the one
post-draw review reads every change since it was prepared: writer calls per own
turn fell from about 1.8 to 1.27 on two new seeds. The writer now submits a
required `assessment` first, counting the whole attack through the opponent's
best blocks, castable haste creatures and burn; the plan follows its verdict.
No code computes or checks lethal. The assessment is now a structured survey:
one entry per hand card, zone, opponent and possible combatant, then a rollup
that totals the whole attack and ranks opportunities. In the blocked Smaug
position the rollup found the win in 5 of 10 replies against about 1 in 5
for free text; decisions take about 50% longer. The pilot asks for help once
per decision, and a response repair no longer restarts the background
preparation. Before each strategy session, focused questions now run in
parallel: one per hand card and per own creature, plus the opponent, their
next attack, the whole attack, removal and other zones. Their answers are rated
findings (threat, opportunity, risk or resource, relevance 1-5), ranked and
handed to six outlooks writing whole lines in parallel: defender, punisher,
long-horizon planner, sequencer, the opponent's view and a removal analyst.
The writer acts as coordinator: it records which reports it adopts and why,
then writes the plan. On saved positions this raised lethal cases to 14/15 and attack
pressure to 9/9, and halved median decision time to about 15 seconds, at
about two to three times the strategy cost.

The October 8 review separates analyst context from prior strategy. Analysts
receive the projected position, card text, lists, odds and recent turns; the
coordinator also receives the matchup plan, notebook and standing plan. Across
six saved positions this reduced input tokens by 47% and reported cost by 29%,
with specific payment, source-binding and attack corrections. This is a small
comparison, not evidence of greater playing strength. Broader win-check prose,
adjacent card text and pilot wording experiments did not resolve the measured
misses and were removed. Discarded preparation now cancels every analyst round,
and trigger choices name their targets explicitly.

The preserved Harmonizer position has an executed turn-7 win: a supplied plan
casts Harmonizer, plays and sacrifices Escape Tunnel, doubles Surrak twice and
attacks for 16. Jev executed it with no gaps or fallback and matching replay and
clone checks. Strategy still misses that full line. Explicit reservation fixed
the Kellan payment in three repeats of one supplied-policy position; reliable
policy authoring, postcombat responses and Smaug's zero-damage target remain
unresolved. The new fixtures distinguish line discovery from its execution.

Two fresh seeds followed. Seed k finished with Red winning on turn 10, zero
gaps or fallback, and matching replay and clone checks. It took 12m49s and
reported $0.508, with two strategy timeouts. Seed l stopped on turn 14 after
the response editor repeatedly preserved an invalid old Ba Sing Se reference.
Strategy now exposes the full plan editor when inherited work is invalid.
From the exact failure prefix, the writer removed the stale step and Jev
completed the turn with no new gaps or fallback and matching replay and clone
checks. This bounded continuation is not a completed second game. False card
and combat claims remain in the generated plans; no strength gain is claimed.

Run notes live in `design-ref/experiments/2026-10-07-reset/`; traces and reports
live in `.pi/renewed-20261007/`. The October 8 comparisons and review are in
`.pi/engine-feedback-20261008/`. These directories do not ship. Keep contracts in
`docs/` and experiment narratives outside the repository.
