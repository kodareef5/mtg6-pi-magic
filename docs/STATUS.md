# Gameplay status

Jev pilots, Sol 6.1 high prepares the matchup, and Luna low writes strategy and
handles judging. Playing strength remains unproven. No model upgrade or coded
lethal search is part of the current work. All 181 offline invariants, type
checks and saved-prefix checks pass.

Each strategy session asks focused questions in parallel, then six outlooks
propose lines in parallel. The coordinator checks their claims against the
position and writes the plan. Its assessment stays in the trace; Jev reads
steps, choices, phase policies and reservations. Analysts read position facts;
only the coordinator also reads the matchup plan, notebook and prior intent.

A sound background preparation can be installed at upkeep without another
writer call. The post-draw review reads all changes since preparation; a covered
draw can keep the plan when the position otherwise matches. Missing coverage
or changed facts still require the writer. Discarded preparation cancels every
analyst round. Invalid inherited work unlocks the full response editor. Accepted
activations remain readable before visible sources enter their permitted zone,
labelled unavailable; describing them adds no move or permission.

October 7 comparisons found 14/15 lethal cases and 9/9 attack-pressure cases
with the parallel survey and outlooks. Median planning time fell to about 15
seconds at two to three times the strategy cost. Two fresh seeds reduced writer
sessions per own turn from about 1.8 to 1.27. The first October 8 review cut
input tokens by 47% and reported cost by 29% across six saved positions by
separating analyst facts from prior intent. These small comparisons do not
establish full-game strength; replay health does not certify legal play.

The latest round kept explicit target identities in strategy instructions.
Both Smaug proposals named "player Green (seat 0)" with the cue. Jev executed
one generated plan and selected that player, with no new gaps or fallback and
matching replay and clone checks. In three repeats of a separate supplied-policy
probe, explicit player wording succeeded 3/3 against 0/3 for the original policy.
Four structural trials failed to improve the two growth lines and were removed:
action/result reports, independent outlooks, card retrieval and attack sequences.
False card and combat claims still appear in generated plans.

Two growth positions now have executed turn-7 witnesses. In one, Harmonizer
and two land entries grow Surrak from 4 to 8 to 16. In the other, warped
Harmonizer and Tunnel grow Hydra to 24 power through ordered counter and power
triggers. Jev won both supplied lines with no gaps or fallback and matching
replay and clone checks. Strategy still misses them. The fixtures grade line
discovery separately from execution. Postcombat response coverage and reliable
reservation authoring also remain unresolved.

Seed k finished with Red winning on turn 10, zero gaps or fallback, and matching
replay and clone checks: 12m49s, $0.508 reported, two strategy timeouts.
Seed l first stopped on turn 14 because its response editor preserved a stale
Ba Sing Se reference. After the repair fix, a bounded continuation passed;
continuing that repaired journal now finished with Red winning on turn 18,
zero new gaps or fallback, and matching replay and clone checks. This later run
took 10m35s of play and reported $0.407; one failed call lacks usage and cost.
The original failure remains recorded. Across turns 15-18, 17 strategy sessions
spent 9m30s on the critical path. Response repairs are the next performance
target; no speed or strength gain is claimed from this continuation.

Run notes live in ignored `design-ref/experiments/`; the October 8 evidence is
in `.pi/engine-feedback-20261008/` and `.pi/gameplay-tuning-20261008/`. Reusable
positions and execution witnesses live in `test/fixtures/benchmarks/`, outside
the published package. [The shared runner](../tools/benchmarks/README.md)
records calls and checks physical continuations.
