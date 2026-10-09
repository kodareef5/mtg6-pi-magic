# Strategy process improvement plan

Proposed next round, October 9, from `0a51987`. Improve the rate at which a
sound strategic line becomes coherent play across different positions. Keep
Jev, Sol 6.1 high for pregame, and Luna low for strategy, judge and summary.
The current contract remains in [Plans](PLANS.md); the completed October 8
round and subsequent measurements remain in [Gameplay status](STATUS.md).

The review found substantial concurrency already: 30 to 35 simultaneous
strategy requests at peak in the latest candidate games. Median initial
analyst requests carried 33 KB of pregame advice; median coordinator requests
were 137 KB. Strategy waits occupied about 78% of the four games' elapsed time,
including one stopped game. Analysts sometimes found a winning line that the
coordinator weakened or declined while writing the plan. These observations
support changing the questions and their handoffs before adding specialists.

Detailed evidence and reproduction live in ignored
`design-ref/process-review-20261009.md` and `.pi/process-review-20261009/`.

## 1. Measure the stages that lose the line

Use the existing benchmark runner, traces and journal continuations. Before
changing prompts, distinguish six failures: missing facts, missed candidate,
wrong selection, lost commitment during writing, pilot departure, and execution
or card-meaning error. Record the earliest failure and any later independent
failure. A structural match, a legal action and a strong choice are separate.

Build a small balanced development set from both pinned decks: immediate wins,
survival and responses, resource conflicts, multi-effect sequencing, development
without a win, and changed-position repairs. Include negative cases where an
apparent win fails. Define acceptable alternatives and observable outcomes
before reading candidate replies. Keep entire source games together when
splitting development from confirmation cases. Repeated generations estimate
stability; they do not increase the number of independent positions.

For selection tests, supply the same candidate reports to both arms. For writing
tests, supply a reviewed chosen line. For pilot tests, supply a complete accepted
plan. For end-to-end tests, let every stage answer and execute the initial plan,
reporting whether a later repair rescued it. Validate each fixture's hand,
window, resources and claimed opportunity before scoring it.

Done when each failure can be attributed without inferring strategy quality
from a PASS or a winner. Reuse current reporting; no new evaluation service.

## 2. Remove repeated reading

In `dossier-strategy.ts`, render one authoritative representation of pregame
advice. Structured policies currently arrive beside route, matchup, traps,
recovery and future step prose. Keep carried briefs unchanged; change what each
question reads. Compare this cleanup alone before changing orchestration.

Give each question its complete applicable policy families, current projected
facts and dependencies. Keep restrictions and relevant full card text beside
sources they affect. Other advice and equipment remain accessible by lookup.
An attack question must see spending restrictions and opposing responses; a
resource question must see reserved attackers. Never use first-N retrieval,
string clipping, or a card's current unavailability to erase a future dependency.

Trim submission instructions to the fields that call writes. Measure dossier,
reports, schema, input tokens, repairs and waits separately. Cached input still
counts as reading. Retain the cleanup only if dependency coverage and executed
decisions hold across the development and confirmation cases.

## 3. Separate choosing from writing

First keep candidate generation fixed and compare the current coordinator with
two short calls through the same strategy role:

| Call | Question | Output |
| --- | --- | --- |
| Choose | Which feasible line best serves this position, considering the opponent's response? | One chosen line, its ordered actions, resource commitments, expected result, dependencies and conditions that change it |
| Write | How does Jev carry out this chosen line? | Existing plan fields: steps, purposes, waits, holds, triggers, phases and conditions |

The selector gets candidates, current facts and their resource conflicts,
without the full plan-writing reference. It may repair a candidate or choose
another line; claimed damage is not proof. The writer gets the chosen line,
its source facts, relevant accepted actions and the unfinished plan, without
the competing essays. It must preserve the selected decisions or name the
specific binding problem. It must not silently choose a different strategy.

Reuse existing action keys and plan fields for the handoff. Keep intermediate
work in the call trace; only the complete accepted plan reaches core. Do not
create another durable plan language or another model role. Use existing
payment forecasts with their unchecked cases visible. This checks consistency
within stated assumptions, not Oracle meaning or optimal play.

Compare the selected line with the written commitments before blaming Jev:
missing casts or activations, changed targets, tapped attackers, discarded
reserves and missing resolution waits each need a named failure. Model-authored
dependencies such as `waitFor` remain explicit; code must not infer them from
card prose. Keep all physical choices offered.

Keep the split only if it preserves good lines and improves executed results
beyond the control's observed variation. Measure its extra sequential latency.
If it repeatedly fails confirmation, remove it and revise the hypothesis instead
of appending another warning. Simple response repairs can remain one short call.

## 4. Replace overlapping analysis, then narrow amendments

After the handoff works, compare the current analyst wave with three concurrent
questions: the best immediate attack or win line, the opponent's threats and
required response resources, and a development line that competes with spending
now. Include attacking before spending and holding resources as real alternatives.
Each proposal states its ordered actions, resource use, assumptions and result.
The selector reconciles them; separate phase writers must not spend the same mana.

This replaces per-card surveys, per-first-action branches and the unconditional
growth analyst on the tested path. Specialist detail becomes a question about
a concrete unresolved dependency. Preserve inspection of every accepted use;
reducing model jobs must not reduce the seat's move list. Bound concurrency
across both seats and give an active response precedence over queued preparation.
All canceled, failed and delayed work remains accounted for.

Keep preparation during the opponent's turn, required upkeep acceptance and
post-draw review. Reuse findings only with their frame, assumptions and source
dependencies. A changed blocker, missing source or new draw starts a comparison
of the affected line and alternatives. Unknown dependency coverage requires
review. A model still decides strategic relevance; syntax and mana checks do
not authorize keeping stale advice. Responses repair the current window and
its affected commitments, without rebuilding the next own turn.

Test removed prerequisites, changed response mana, tapped entry, a new relevant
draw, a harmless change and a resume with no cached work. The October 6 narrow
review experiment retained stale advice, and 67 of 84 later draw reviews changed
actions or steps. Narrow the work only after these cases are covered. Reset,
rollback and close must cancel stale jobs; late answers cannot install plans.

## Retain changes by gameplay evidence

Freeze the scoring rules, confirmation positions and live-call budget before
each comparison. Measure an unchanged control twice. Compare one process change
at a time, using identical preparation, model settings and summaries. Do not
reuse repeatedly inspected cases as fresh confirmation. Keep failed attempts
in the denominator and report infrastructure failures separately.

Then play fresh seeds with candidate against control, swapping their deck
assignments and balancing who starts. An initial eight seed pairs is a screen,
not a playing-strength claim. Review missed wins, avoidable losses, resource
conflicts, plan obedience and legal play alongside outcomes. Report median and
tail strategy waits, preparation reuse, repairs, calls, tokens and cost. Require
replay/clone parity and keep gaps and fallback visible.

Land each successful step as a replacement and delete its superseded prompts
and paths. Keep experiments and long reviews outside published docs. Both
`npm test` and `npm run check` must pass before a commit. The first implementation
should be stage scoring and duplicate-context removal; broader concurrency and
amendment changes follow evidence from the choose/write experiment.
