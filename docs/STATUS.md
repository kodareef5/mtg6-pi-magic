# Gameplay status

Jev remains the pilot, Sol 6.1 high prepares the matchup, and Luna low writes
strategy and handles judging. Strategic quality remains unresolved. No model
upgrade or coded lethal search is part of the current work.

Each strategy session asks focused questions in parallel, then six outlooks
propose lines in parallel. The coordinator checks their claims against the
position and writes the executable plan. Its assessment stays in the trace;
Jev reads steps, choices, phase policies and reservations. No code computes
or checks lethal.

A sound background preparation can be installed at upkeep without another
writer call. The post-draw review reads all changes since preparation; a covered
draw can keep the plan when the position otherwise matches. Missing coverage
or changed facts still require the writer. Discarded preparation cancels every
analyst round. A response normally edits its current window; invalid inherited
work unlocks the full editor so the writer can explicitly repair it.

October 7 comparisons found 14/15 lethal cases and 9/9 attack-pressure cases
with the parallel survey and outlooks. Median planning time fell to about 15
seconds at two to three times the strategy cost. Two fresh seeds reduced writer
sessions per own turn from about 1.8 to 1.27. These saved-position checks and
small game samples do not establish playing strength. Four earlier seeds had
healthy replay and clone checks but still contained missed attacks and false
tactical claims; one illegal menace block was challenged, rewound and corrected.

The October 8 review separates analyst context from prior strategy. Analysts
receive the projected position, card text, lists, odds and recent turns; the
coordinator also receives the matchup plan, notebook and standing plan. Across
six saved positions this reduced input tokens by 47% and reported cost by 29%,
with specific payment, source-binding and attack corrections. Broader win-check
prose, adjacent card text and pilot wording experiments failed to resolve the
measured misses and were removed. Trigger choices name their targets explicitly.

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
From the exact failure prefix, the writer removed the stale step and Jev
completed the turn with no new gaps or fallback and matching replay and clone
checks. This bounded continuation is not a completed second game. False card
and combat claims remain in generated plans. All 181 offline invariants and
type checks pass; they verify the machinery, not arbitrary tactical prose.

Run notes live in `design-ref/experiments/2026-10-07-reset/`; traces and reports
live in `.pi/renewed-20261007/`. The October 8 comparisons and review are in
`.pi/engine-feedback-20261008/`. These directories do not ship. Keep contracts in
`docs/` and experiment narratives outside the repository.
