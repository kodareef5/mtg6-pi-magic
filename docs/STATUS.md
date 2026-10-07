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
No code computes or checks lethal. The assessment is now a structured survey:
one entry per hand card, zone, opponent and possible combatant, then a rollup
that totals the whole attack and ranks opportunities. In the blocked Smaug
position the rollup found the win in 5 of 10 replies against about 1 in 5
for free text; decisions take about 50% longer. The pilot asks for help once
per decision, and a response repair no longer restarts the background
preparation. Before each strategy session, focused questions now run in
parallel: one per hand card and per own creature, plus the opponent, their
next attack, the whole attack, removal and other zones. The writer then rolls
them up. On saved positions this raised lethal cases to 14/15 and attack
pressure to 9/9, and halved median decision time to about 15 seconds, at
about two to three times the strategy cost.

Run notes live in `design-ref/experiments/2026-10-07-reset/`; traces and reports
live in `.pi/renewed-20261007/`. Neither directory ships. Keep contracts in
`docs/` and experiment narratives outside the repository.
