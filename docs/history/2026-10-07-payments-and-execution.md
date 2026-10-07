# Payment checks and execution instructions, October 7

This round resumed the October 6 goal with the same gameplay roster. Private
requests, answers, scripts and continuations are under
`.pi/resume-20261007/`. The production planner has not adopted a new stage.

## Changes retained

`paymentForecast` returns example payments for the stated sequence, the sources
left after each payment, conflicts, and explicitly unchecked work. It reserves
currently bound future attackers while finding payments. An ordinary attack
spends its tap before a later payment; vigilance leaves that source available
after attacking. An earlier mana payment still prevents a vigilant attack.
The forecast does not simulate resolving instructions or new attackers.
The existing `budget` reader continues to return advisory conflicts.

Payment options now identify a source that the remaining attack plan names.
The mark says that this payment taps that source and it would need to untap
before attacking. The engine already excludes tapped attackers. The new mark
guides the earlier payment choice without removing options or choosing for Jev.

Commits `3be4aed` and `bbadb19` passed types, all 179 tests and all 18 saved
prefix replays. The arithmetic invariant compares the forecast's witness with
a real offered payment and checks normal attacks, vigilance, conflicting
payments, unchanged state and false conditional commitments.

The review follow-up marks unpriced and missing-source response branches and
own-turn alternatives as unchecked. It also reads resource-producing response
instructions before deciding whether a witness can be given. Receipt fields
now explicitly name remaining mana sources; they never claimed to list every
untapped permanent. Response payments are checked separately and are not listed
in the ordered-action witness.

## Planning comparisons

Every row below contains three Red blocked-lethal cases and three Green
after-Explorer cases. Acceptance checks syntax and scoped resources, not strategy.
The small proposal shape names actions before combat, attackers, untapped
reserves, actions after combat and a reason. Its first mechanically valid
submission receives a payment receipt and must confirm or repair it.

| Question | Accepted | Calls | Whole decisions | Reported cost |
|---|---:|---:|---:|---:|
| Production baseline | 6/6 | 7 | 93.7 s | $0.009852 |
| Small proposal with payment feedback | 6/6 | 15 | 51.6 s | $0.007506 |
| Production writer binding those proposals | 6/6 | 6 | 55.3 s | $0.017348 |
| Current facts first, other context through lookup | 3/6 | 23 | 49.0 s | $0.014965 |
| Text rendering of current facts | 6/6 | 20 | 36.2 s | $0.007602 |
| Individual-cast payment examples supplied up front | 6/6 | 15 | 57.9 s | $0.009196 |
| Card names beside source ids | 4/6 | 17 | 60.3 s | $0.008421 |

The unchanged production planner missed Red's complete winning attack in all
three answers. Green passed its narrow land-use property three times, while
still making false claims about mana and absent protection.

The first checked-proposal question selected the complete winning commitment
twice. A third answer described Smaug attacking but omitted it from the selected
attackers. Green's proposals still lost sequencing or continuations. Asking
the production writer to bind those proposals passed four narrow properties
out of six, but it destroyed one good winning commitment and repeated false
facts. Another prose-writing stage is not supported by this comparison.

None of the remaining variants established a reliable complete Red commitment,
and none was adopted. The reviewers found material protocol confounds:

- Combat keys could appear in the before-combat list as well as the attackers
  list. One answer selected an attacker twice and received a misleading resource
  conflict rather than a duplicate-declaration diagnostic.
- The checked, payment-example and named-source menus omitted fetch activations
  whose source would enter later, and supplied no equipment lookup. Those fetch
  omissions cannot establish a planning failure. The focused and readable arms
  used a wider catalogue, so they also changed available continuations.
- Informational receipts used the refusal channel, which says to fix the answer.
  The confirmation flag belonged to the session rather than the exact proposal.
  A changed proposal could avoid another receipt; a first valid proposal on the
  last reply could exhaust the confirmation round.
- The Green structural check admitted a warped Harmonizer with no useful attack
  before its end-step exile. A graveyard land alone does not establish useful
  development. The Red check also required one specific winning lineup rather
  than accepting every executable win through the visible block.

Rejected protocol answers are not all failed tactical recognition. Named source
keys appeared in some corrected attacks; these small confounded samples establish
neither benefit nor harm from the names. Recorded false source and damage claims
remain failures regardless of those limitations.

## Physical execution control

The two complete checked Red proposals were installed unchanged at decision
579 and played through the ordinary seat loop. Both paid Smaug without tapping
the animated Sanctuary. The first declared all three attackers and won on turn
14. The second asked for help after declaring Kellan; Luna then removed the
other attacks. That run stopped at turn 15 without an outcome. Their play times
were 23.5 and 37.5 seconds. Both had no gaps or fallback and matched replay.

A control kept the second proposal's exact actions and holds, replaced its
objective with the selected attack labels, and rendered explicit phase
instructions from the same ordered steps. It removed the generated factual
narrative, including the false claim that Kellan alone was already lethal.
No tactical action or physical choice was supplied by the control renderer.

Three continuations under those instructions all won on turn 14, in 9.5 to
10.4 seconds of play, with no foreground planning, gaps or fallback and matching
replay. This supports testing a cleaner separation between strategic rationale
and executable instructions. It establishes execution of a supplied line,
not reliable generation, prepared-turn coverage or full-game strength.

## Full game from version zero

The production planner, with carried preparation and the retained payment
changes, finished an ordinary game from decision zero. Red won on turn 10.
The journal and report are under `full-game/`, stem
`next-version-gate-20261005-1791333555864`.

- Play: 5m25s; total wall: 5m26s; strategy wait: 4m11s.
- Jev: 249 calls; strategy: 39 attempts, 12 foreground sessions, two help
  requests. Six of nine background preparations were ready when needed.
- Reported usage: 1,578,420 input tokens including 264,704 cached, 43,913 output
  tokens, $0.0994. One cancelled call lacks usage and cost. No call truncated.
- 264 physical decisions: 23 forced, 241 chosen, no delegated or fallback.
  No recorded gaps, and the complete journal matched replay. Summary stayed off
  as in the comparison runner; version-zero preparation cost is not included.

This is completion evidence, not a strategic pass. Accepted plans show failures
beyond the diagnostic position:

- Red at decision 64 claimed two Mountains could not pay Zhao's `{1}{R}`, then
  claimed a Mountain remained untapped after paying with both available lands.
- Green at 94 planned to fund a warped Harmonizer with Promising Vein while
  acknowledging that Zhao made the Vein enter tapped. The creature never cast.
- Green at 148 skipped the available Passage land play after an upkeep fetch
  had spent resources needed for development. No creature appeared until turn 9.
- Red at 236 spent Treasure on Burst Lightning, then still counted that Treasure
  in Smaug's attack trigger. Its stated combat damage also ignored the Hydra
  block. The actual attack won despite those false claims.

The next experiment must grade coherent actions and their execution separately.
Both committee reviewers agreed on one versus two generated candidates with the
same corrected receipts, explicit final selection and no prose binder. Receipts
describe current creatures, selected actions, intended entries and example
payments; they do not predict a resolved battlefield. Completion, response and
exception policies must be explicit. No empty list permits a pass. Upkeep,
opponent turns and resolution need coverage before production adoption.

## Entry forecast correction

A subsequent review identified a real false refusal: playing Fabled Passage and
then activating it reported no Passage on the battlefield. The ordered forecast
recorded the land's future payment contribution but source lookup still read the
initial position. The same defect affected an ordinary permanent cast followed
by its activation. Earlier strategic scores must not treat those refusals as
proof that the model chose a bad continuation.

The forecast now carries ordinary entries into later source lookups with their
new incarnations. Its payment search still starts at the original position, so
the future source cannot pay for an earlier cast. Consumed cards remain consumed.
Fetch sacrifice and search instructions remain explicitly unchecked; this fix
does not pretend to resolve them. Newly entered creature attacks and tap abilities
retain their entry-characteristic limitation.

The arithmetic invariant reproduces both false refusals and compares the later
source with the real offered activation. Commit `3b653c9` passed types, all 179
tests and all 18 saved-prefix checks.

The shared benchmark runner repeated three Green cases three times after the
entry fix. All nine answers were accepted; the old narrow checker passed seven.
The run used 14 calls, 2m16s of reported request time, 346,291 input and 15,046
output tokens, and $0.0231. Evidence is under `entry-recheck/`.

Two of the three after-Explorer answers now retained a Passage play followed by
its activation. Two chose lasting Hydra development; the other skipped it and
still included an Explorer attack despite describing it as summoning sick. The
landfall amendment still made false mana claims, and preparation kept stale
Veil prose. The regex checker also flagged a reservation sentence that explicitly
said Veil was absent. These results support correcting the false refusal, not
claiming coherent strategy from the seven narrow passes.

## Optional responses and selector aliases

An unfunded `may` response now appears separately from ordered-step conflicts.
Its warning describes the example payment's remaining sources, not a guarantee
that every possible payment fails. An unchecked response keeps the ordered-line
witness intact. Unpriced alternatives remain explicit; a costless pass creates
no resource warning. Explicit holds and ordered actions retain their checks.
The writer sees existing optional-response warnings as facts without a refusal.

The writer also accepts `card` as an alias for `name` inside conditions, while
retaining `card` in action-source queries. Conflicting names are still refused,
and journals retain the canonical syntax. No system-prompt paragraph was added.

Derived execution instructions, the shared candidate comparison and the narrow
prepared-plan reuse case remain pending. Experimental proposal and instruction
renderers remain outside production.

## Physical benchmark continuations

The shared runner now accepts `--play` and a saved `--answers` file. It installs
the exact selected plan in a clone, verifies the copied table and preparation,
and runs the ordinary seats through the next opponent turn or an explicit turn
boundary. Each continuation saves its journal, trace, outcome, timing, cost and
replay check. Planning and continuation costs remain separate. A fixture with an
expected winner grades the observed outcome instead of requiring one attack set.
That outcome does not prove a win against every legal response.

The first physical recheck used after-Explorer answer zero. Green cast Hydra,
played Passage from the graveyard, activated it and searched. Hydra reached 16
counters. Red won on the following turn. The continuation took 90.2 seconds,
118 Jev and seven strategy calls, 1,113,323 input and 14,272 output tokens, and
$0.0567. Clone and replay matched, with no gap or fallback. This validates the
repaired source path without claiming that development saved the position.
Evidence is under `entry-recheck-play/`.

## Shared candidate comparison gate

Preflight found that exact future incarnation references were rejected as absent
from the current view. Queries now distinguish physical card `ids`, which follow
an identified card through a proposed zone change, from `refs`, which retain
their exact-incarnation meaning. The candidate catalogue binds a cast to one
visible card and its later attack to that card's id. This avoids both a guessed
future incarnation and an ambiguous name when several copies are visible.
Binding grants no timing, source permission, entry or attack eligibility. Shared
card packages still reject game-specific ids. The invariant test follows a real
cast through resolution and confirms that the old exact reference expires.

Attackers within one declaration are also marked available together. Finishing
the declaration still follows them. Core marks, checklist status and the pilot's
Now/Then script use the same ordering reader; every action remains a seat choice.

Before running inference, the comparison is fixed at eight positions, three
repetitions per arm. Arms request one or two distinct candidates, with identical
facts, receipts, three-reply budget, 4,000-token output ceiling and roster.
The runner alternates arm order. Registration, repair and final selection are
recorded separately. Selection must follow that exact candidate's receipt;
exhaustion is unresolved and never selects a candidate automatically.

Review the eight cases as follows:

- Blocked lethal: choose a winning line through the visible block, with legal
  attackers and feasible resources. Accept either winning construction.
- After Explorer: retain useful lasting development before the land and fetch
  when payable. A pointless warp with no attacker fails.
- Two red mana: recognize that two Mountains pay Zhao's generic-plus-red cost;
  no source can remain available after it was spent.
- Tapped Vein: never fund current development with the Vein entering tapped.
- Upkeep fetch: use the remaining land play. Do not demand a three-mana spell
  when only one current Forest is untapped.
- Treasure lethal: spend each Treasure once and account for Hydra's block.
- Landfall order: preserve useful beneficiary-before-land development within
  the actual mana budget and without an absent response reserve.
- Established attacker: use the ready Zhao against the empty creature board,
  without carrying the earlier sickness claim into this turn.

A promising arm must pass all three blocked-lethal repetitions, at least two
of three in every other case, and have at most three outright failures across
24 sessions. Reasons and explicit execution policies are reviewed separately;
a structural pass cannot excuse their resource or combat contradictions. The
two-candidate arm must add at least three reviewed successes, regress no case by
more than one and stay within twice the one-candidate median planning latency
to justify its extra generation. These small samples select the next work; they
do not establish playing strength.

Physically continue selected lethal proposals through the shared runner and
review their visible opposing responses. Then run a full game if the focused
evidence supports it. If both arms fail, classify the missing dependency or
policy instead of starting another wording sweep. Full-game completion, replay
integrity and strategic quality remain separate gates.

The first four sessions under `candidate-comparison/` are preflight evidence,
not the comparison gate. They exposed a missing shared reader: the experimental
compiler skipped production's condition aliases and comparison-bound checks.
It now uses `changedPlan`, and the prompt supplies the same condition reference,
binding facts and reference tools. The stopped run also produced real stale-Veil
claims; those remain examples to review, not a scored arm result. Its interrupted
request may lack completed usage. The corrected run uses a fresh output directory.

The corrected 48-session gate (`candidate-comparison-v2/`, commit `0d64ec2`)
did not qualify either arm. One candidate yielded 18 accepted plans out of 24;
two yielded 19. Median session times were 12.52 and 15.38 seconds. The old narrow
flags passed 13 and 16 respectively; those are not strategy scores. Total spend
was 124 calls, 3,273,063 input tokens (1,984,000 cached), 40,480 output tokens,
11m38s request time and $0.1690 reported cost. One WebSocket failure lacks usage.

Neither arm produced a winning blocked-lethal line in its three sessions. Some
sessions failed schema or named-reference handling; their raw proposals also
missed the win. Two accepted one-candidate replies treated the old attack as
already declared, put Red at six life instead of eighteen and preserved a
blocker against a nonexistent trampling Forest. Their current position said draw
step, untapped Kellan, nontrampling Explorer and eighteen life. The supplied old
phase narrative remained more influential than these facts.

Two candidates put Hydra before the land in two after-Explorer sessions; the
one-candidate arm put the land first in all three. Other errors remained: stale
Veil reservations, fictional remaining mana, excess land plays, and an unfunded
Ascension after a fetch whose effects the payment forecast leaves unchecked.
Both arms often chose Mountain then Zhao correctly. Several reasons still
claimed an unspent Mountain after spending both. Some Treasure-position lines
can win while their reasons or execution policies miscount Treasure or blocking.

Registration, resource feasibility, coherent execution policy and useful play
must therefore remain distinct. The candidate path stays experimental. The next
production decision concerns derived execution and stale carried narrative,
including coverage outside own main phases, not a larger candidate count.

Both selected iteration-zero Treasure lines won through the shared physical
runner (`candidate-treasure-play/`): 9.20 seconds for one, 8.05 for two, each with
26 Jev calls and no foreground planning. Clone and replay matched, with no gaps
or fallback. Each cancelled one unfinished background preparation at game end;
reported costs were $0.0069 and $0.0062, excluding its missing usage.

These wins expose an execution limitation rather than remove it. The first
proposal specified two Mountains for Kellan's upgrade; Jev used Mountain and
Treasure, then won through Hydra blocking Kellan. The second specified Treasure
for Burst; Jev used Mountain, killed Hydra and attacked with all three creatures.
`choices` was compiled only to a step's resolution purpose, so its casting
payment instruction did not reach the action question. Payments chosen by Jev
were valid, but this is not proof that the full proposed policy was delivered.
The [preferred question sequences](2026-10-07-execution-examples.md) identify the
announcement, trigger, resolution and opponent-turn coverage needed next.

## Scoped execution contract

The continued paseo-committee review converged on one production change, using
the existing plan representation. `throughTurn` expires all tactical work,
including holds without a window. Fresh planning starts from pregame policy,
equipment and current facts. Repairs preserve scope; no old windows are rebased.
The reviewers initially differed over field bounds versus whole-plan expiry and
current versus original trigger guidance. Both accepted whole-plan expiry and
announcement-time recovery. Both rejected automatic precedence between a hold
and a contradictory payment purpose: show both and request a repair.

Jev now receives step and branch purpose during announcement and every target
and payment inspection. Context derives ordering and progress. General objective
and guidance stay in the audit record; phase guidance supplies scoped response,
trigger and continuation policies. Optional phase `complete` is `pass` or `ask`;
absence grants no permission. Ordinary and triggered resolution recover the
phase policy from work accepted when the ability was announced, preserving it
through amendments, replay and cloning. Missing tactical coverage can still use
the immutable pregame policy, not a later tactical rewrite.

The resource forecast again prefers a payment that leaves each priced response
funded separately. If none exists, it returns a payable ordered-line witness and
advisory response warnings. Preference failures cannot become ordered conflicts.
The shared benchmark adds a fresh-planning variant of blocked lethal so old
saved preparation does not enter a test of fresh-turn lifetime.

Offline checks cover expiration before upkeep, package persistence, exact window
retention during repair, purpose delivery through all inspection stages, trigger
policy after amendment/replay/clone, and explicit completion. The existing
two-Merchant fixture now requests each plan within its intended turn pair;
it still checks the same turn-3 response, discards and replay. No model roster or
effort changed. Live execution and strategic quality remain to be measured.
