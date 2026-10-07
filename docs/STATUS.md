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
No failed prompting arm remains in production. The current checks pass all 178
invariants; an unused phase-planning predicate and its obsolete test were deleted.

Claude's tuning round on October 7 kept two changes. A sound background
preparation is installed at a plain upkeep without a writer call, and the one
post-draw review reads every change since it was prepared: writer calls per own
turn fell from about 1.8 to 1.27 on two new seeds. The writer now submits a
required `assessment` first, counting the whole attack through the opponent's
best blocks, castable haste creatures and burn; the plan follows its verdict.
No code computes or checks lethal. Saved lethal positions rose from 7/15 to
about 11/15 with the non-lethal guards unchanged; the blocked Smaug line still
wins only 2/6.

Run notes live in `design-ref/experiments/2026-10-07-reset/`; traces and reports
live in `.pi/renewed-20261007/`. Neither directory ships. Keep contracts in
`docs/` and experiment narratives outside the repository.
