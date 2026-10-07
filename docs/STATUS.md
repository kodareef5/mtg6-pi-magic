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

Run notes live in `design-ref/experiments/2026-10-07-reset/`; traces and reports
live in `.pi/renewed-20261007/`. Neither directory ships. Keep contracts in
`docs/` and experiment narratives outside the repository.
