# Prepared-turn and pilot review, October 6

Claude identified the main remaining delay in the reviewed gate: all eight
prepared turns were amended. Their waits account for about 477 seconds of the
534 seconds spent waiting for strategy. Five preparations had finished by the
draw. The `settled` gate requires `changes.quiet`; ordinary opposing lands,
taps, notes and actions make that false. No prepared turn bypassed amendment.

The source gate is
`.pi/review-cycle-20261006/gate/next-version-gate-20261005-1791285458578.jsonl`.
Its result, calls and timeline sit beside it. This review ran saved-position
probes, not another full game. Production models remain unchanged.

## A short Luna call as pilot

The comparison used nine saved decisions, three repetitions per model, with
model order alternating. Both models received the real pilot question and
inspection path. Luna low used a chat submission containing one offered id;
Jev used Pi's classifier interface. Expected answers came from the recorded
plan and the reviewed position, not a new strategy model.

| Pilot | Expected decisions | Calls including inspection | Median decision | p95 decision | Input tokens | Output tokens | Cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jev | 27/27 | 33 | 253 ms | 661 ms | 101,307 | 2,421 | $0.004255 |
| Luna low | 24/27 | 27 | 1,714 ms | 11,933 ms | 50,784 | 609 | $0.003678 |

Luna passed on the planned Burst Lightning response to Chocobo in all three
repetitions. Jev inspected the available use and selected it. The remaining
eight cases matched with both models. Luna's lower bill includes skipping the
inspection needed for that response, so it is not equal completed work for
less money. Total measured cost was $0.007933, with no failed requests.

This small sample measures interface execution, not Magic strength. It supports
keeping Jev for each physical decision. A narrow Luna exception review remains
worth testing; using Luna for every button would add latency without a measured
quality benefit here. No hybrid role or production chat pilot was installed.

Evidence: `.pi/review-tune-20261006/pilot-comparison/`, `results.json` and
`calls.jsonl`. The nine pilot cases are in `tools/benchmarks/positions.json`.
The original run predates explicit call-interface accounting: its `pilot` and
model fields identify the adapter; its role-level type labels still assume
decide means classifier. New calls record the actual chat/classifier interface,
and reports keep interface totals separate from the five roles.

## Narrow amendment experiment

Two trials used the same accepted preparations and saved post-draw positions
from the preceding gate. The experimental question asked for `{}` or changed
fields, retained visible position and full card text, and put complete pregame
policy families behind a lookup. It did not truncate strings or options.

The first trial kept both Red plans but mishandled Green's missing permanents:
the repair dropped the beneficiary and fetch and left only the declaration
ending. The second trial sent a mechanically invalid base to the full repair
question. It restored Explorer but put Forest before it, losing the landfall
trigger even though existing lands could pay for Explorer first.

The kept Red plans exposed another defect: their existing guidance contained
incorrect mana arithmetic and an outdated claim about Zhao's summoning
sickness. A mechanically valid plan can still carry false strategic advice.
An empty `askWhen` list is not evidence that every relevant change is covered.

The trial was therefore removed from production. Existing amendment behavior
remains until the preparation and acceptance contract handles these cases.
Mechanical acceptance and a shorter answer are not sufficient success metrics.

Evidence:

- Accepted bases: `.pi/review-cycle-20261006/accepted-preparations.json`.
- Narrow-only trial: `.pi/review-cycle-20261006/amend-components-1791287578098/`.
- Split review/repair trial: `.pi/review-cycle-20261006/amend-components-1791287704003/`.
- Earlier beneficiary-first answer: `.pi/review-cycle-20261006/amend-components-1791284835939/`.
- Experimental diff: `.pi/review-tune-20261006/narrow-amendment-experiment.patch`.

The shared benchmark's `green-landfall-order` property accepts the earlier
answer and rejects the split trial offline. Guidance still needs manual review;
an action-order property cannot check every strategic assertion in prose.

A final live check through the registered runner used the unchanged full
amendment question and also failed the landfall order. It took 49.4 seconds,
three calls, 67,535 input and 2,752 output tokens, at $0.006240. The first two
answers used nonexistent reusable action keys; the accepted third answer still
put Forest before Explorer and referred to protection absent from the hand.
Evidence: `.pi/review-tune-20261006/registered-amendment/`. All calls are recorded
as strategy/chat. The earlier good answer is a positive control, not proof of a
reliable baseline. Both question shapes need improvement; these samples do not
establish that narrowing the question caused the sequencing defect.

## Changes retained

Future-turn preparation now refuses literal picks from the opponent's current
decision. It can still use stable continuations and reusable selectors. Window
schema descriptions explain omitted steps, combat phases and whose turn owns
attacking or blocking. Whole-library search guidance excludes limited object
sets and requires the associated shuffle; optional declining remains available.

The benchmark manifest collects nine pilot cases, three preparation cases and
one amendment case. It validates prefixes offline and makes paid runs explicit.
Missing local artifacts fail rather than silently skipping cases. Reports keep
tokens, latency and cost for every attempt, including inspection requests.

Pi supports strict tool schemas, but its converter rejects constructs in the
current submission shape, including object unions and open objects. Enabling
strict mode requires a compatible submission shape; it is not a free toggle.
Type selectors and other proposed syntax changes remain to be designed and
tested. No silent normalization of invalid plans was added.

## Next experiment

Start with the keep/amend/replace examples in `docs/PLAYBOOK.md`. Separate
reusable policies from conclusions bound to an old hand, board or turn. A
prepared line must describe covered draws and the conditions under which its
sequence, responses and combat policy remain applicable. Missing coverage means
review; ordinary change alone should not mean rewriting the whole turn.

Only then test bypassing amendment for covered changes. Check both a valid
reuse and changed blockers, response resources, removed prerequisites and
uncovered draws. A remaining amendment should receive the affected policy
families and steps, with other complete policies available on demand. Preserve
an unaffected objective; replace a false bound conclusion.

Keep later preparation restarts and shorter timeouts as separate experiments.
Restarting later sacrifices overlap and can increase draw-time waiting. Measure
the reuse change before altering either timing policy. Consolidate prompt
patches against the saved cases instead of adding one sentence per failure.
