# Next-version validation, October 5

The contract is in [PLANS.md](../PLANS.md). This record separates component
checks from full-game evidence. The roster stayed Jev for decisions, Sol 6.1
high for pregame and Luna low for strategy and judge. Summary was off, matching
the prior matchup batch.

## Preparation and components

A fresh pair of scoped briefs took 6m07s, 10 calls and $0.6472, with 56,073 input
and 53,848 output tokens and no failed questions. Each policy family has one
analyst; synthesis carries unchanged families. The earlier unscoped attempt
took 14m56s and had four timeouts. Neither measurement includes card assessment.
The installed Pi route did not enforce the requested output ceiling. The trace
records the requested ceiling and reported usage; do not describe it as a
provider-enforced cap.

The gate carries accepted card equipment. Shock, Rockface Village and Nova
Hellkite instead carry fresh standing assessments and deferred uses, so their
visible uses must pass through Luna's interpreter. All carried packages were
revalidated during preparation. A version-zero clone preserved the same table
and briefs. This is carried preparation, not a cold-start timing measurement.

Component checks exercised Shock damage, Village entry and restricted mana,
normal and warped Nova entry, flying and haste, and warp's delayed exile.
The Nova test first omitted entry registration in its fixture; the corrected
fixture uses real casts and verified both modes. That initial failure was not
evidence of a model interpretation error.

Saved strategy positions covered a new turn, beneficiary-before-land ordering,
a protection effect that did not cover the target, a lethal normal cast from
exile, a losing block, and current response timing. Response answers now bind
the observed turn and step in context. Ordinary strategy reads accepted claims,
costs and target facts; full executable bodies remain available through lookup.
Cards in hand, exile and the battlefield appear in separate position groups.

The stopped large-choice position exposes all 1,040 damage assignments through
51 menus of at most 50 choices. Inspection moves no cards and preserves every
original leaf. The four prior batch journals still replay to their old outcomes
or stopping point. Clone tests cover a later rollback after a retained ruling;
delayed-trigger tests cover the source leaving in its own watched event.

## Early gate stops

The first attempt was stopped after 34 seconds: carried card equipment had
suppressed per-turn planning. Seating now enables the planning policy even
when card equipment already exists. An offline invariant covers both prepared
and fresh seats; neither spends strategy before the draw.

The second attempt was stopped at turn 5 after roughly four minutes. Of its
22 strategy requests, 11 followed a refusal. Some accepted branches tested a
library-top object for hand or battlefield membership, so their stated intent
could never fire. Validation now rejects that contradiction. Ordinary planning
reference material describes visible counts, life and history; full instruction
syntax remains a lookup. Three follow-up saved-position sessions produced
accepted visible-state conditions, with seven calls in 1m19s and $0.0108.

Those sessions also contained poor strategic advice, including an incorrect
claim that red plus colorless mana could not pay for Lightning Strike and an
unjustified recommendation to delay a tapped land drop. Shape acceptance is not
a playing-strength result. Full-game decisions must be reviewed separately.

## Finished gate and review

`next-version-gate-20261005-1791250809663` ran at commit `552c2bb` from ordinary
version-zero setup with the carried preparation described above. Red won on
turn 16. The 710 physical decisions comprise 68 forced and 642 chosen decisions;
none were delegated or fallback. Replay matched and no gap was recorded.

| Measurement | Result |
|---|---:|
| Play / final reporting | 15m14s / 2.7s |
| Strategy wait | 12m07s, about 80% of play |
| Jev calls | 675 picks, zero separate reviews |
| Strategy calls / foreground sessions | 67 / 32 |
| Strategy requests following refusal | 16 |
| Plan help requests / essential stops | 13 / 3 |
| Judge calls / rulings | 0 / 0 |
| Summary calls | 0 |
| Reported input / output tokens | 4,904,358 / 99,309 |
| Reported cached input tokens | 465,408 |
| Reported model cost | $0.2621 |

Jev used 3,712,787 input and 41,608 output tokens, 2m50s of request time and
$0.1559. Luna low used 1,191,571 input and 57,701 output tokens, 18m44s summed
request time, 13m03s active time after accounting for overlaps, and $0.1061.
Three cancelled preparations returned no usage; totals cover the other 739
requests. The timeline places all 742 attempts and all 16 turns, with peak
concurrency of three calls. There were no provider failures.

The gate is faster than the prior finished runs' 19.9-27.0 minutes of play,
but the seeds and decisions differ. This is not a controlled speed result, and
the requested fivefold improvement is not achieved. The $0.2621 excludes the
fresh brief's $0.6472 and any earlier card assessment. Do not report the carried
setup's near-zero duration as cold preparation performance.

The reviewed physical sequences include Zhao's tapped nonbasic entry, both
Kellan upgrades, two damage events and exile triggers from double strike,
earthbend returning a destroyed land, Ascension's fourth-counter reflexive
trigger, landfall mill and growth, and trample through a double-strike blocker.
These provide interaction evidence, not a complete legality audit. The deferred
spell interpreter was exercised in component tests; this game's strategy bill
contains no interpretation calls.

The review found a context omission at turn 10, decision 264. The accepted line
called for Smaug in main phase, but Jev's draw-step packet carried only the
pending labels, without their windows. Request 285 selected Sanctuary animation
and spent that line's mana. Animation persists, so this is not a claim that the
ability always needs four other mana; an immediate attack does. Later guidance
incorrectly treated the tapped Sanctuary as an available attacker.

Commit `e93f8d9` carries pending windows and their closed-window or false-condition
status beside each label. In the exact saved position, the corrected packet
produced one Jev call, 290ms, selecting pass. No physical action was applied by
that component check. The full gate predates this context correction; its result
must not be presented as a second full game under the corrected packet.

Other observed weaknesses remain: Red declined an early available attack;
background plans sometimes proposed casting a creature already in play; response
prose sometimes retained mana the ordered line spent; and Green used a fetch
before its next beneficiary instead of preparing a better landfall sequence.
All 15 prepared turn plans were amended after drawing. The next work is focused
candidate binding, whole-line resource forecasts and narrower amendments, using
these positions before another game batch. A completed game is not expert play.

After the gate, clones at decisions 0, 264 and 350 matched their parent's table
and briefs exactly. The four earlier batch journals still reached their original
outcomes or stopping point. Types and all 179 offline tests passed after the
pending-window correction. Timeline data covers every timed call; its script
also passes a syntax check. No browser rendering check was run.

## Local evidence

Private prompts, journals and component outputs are under
`.pi/next-version-20261005/`. `gate-preparation.json` identifies the carried
assessments and fresh briefs. `card-components-1791246196553/verification.json`
holds the corrected physical card check. The fresh brief run is under
`scoped-pregame/`; `gate-planning-components-1791250696429/` holds the later
preparation checks. The stopped runs have separate review records in `gate/`.
These files contain seat knowledge and are excluded from the package and git.

The gate's result and interactive timeline share its name under `gate/`.
`gate-clones-1791251846155/verification.json` records prefix and timeline checks.
`pilot-window-component-1791251715828/` holds the corrected draw-step request,
reply and unchanged position. These paths preserve the distinction between the
full run and the later targeted correction.
