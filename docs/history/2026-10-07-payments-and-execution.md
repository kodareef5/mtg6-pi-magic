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

At `b68b6db`, fresh blocked-lethal planning accepted all three answers in four
calls, but none found the win. The old midcombat base was absent; new wrong
claims about sickness, blocking, mana and attacks remained. This passes the
lifetime correction, not strategy quality.

Supplied blocked lethal won 3/3 in 16.5, 18.0 and 21.5 seconds. All runs needed
Green's blocking repair; the last also needed a needless Red priority repair.
The supplied Hydra, Passage and Forest-search line completed 3/3 through its
own turn in 56.6, 48.2 and 52.6 seconds, each with a trigger-order repair. Both
sets had zero gaps/fallback and matching replay, but failed the no-routine-repair
execution gate. These are authored control policies, not generated strategy wins.
Their data is in `.pi/resume-20261007/execution-controls.json`; traces are in
`execution-blocked-controls/` and `execution-green-controls/` beside it.

The unchanged Treasure control won in 8.69 seconds without foreground planning,
but paid Mountain plus Sanctuary instead of its specified two Mountains. The
payment question now contained that purpose in the due step, script and use
notes: delivery was verified, obedience failed. Every alternative still had
the same action label and required following payment/funding/object references
to identify its sources. The next small change names each payment's actual
sources, colors and sacrifices in its choice label, without selecting or
removing any option. Its unchanged-policy repetition is kept separate from
the earlier delivery control.

At `abeacae`, the unchanged two-Mountain control obeyed its stated payment 3/3
and won 3/3. Play took 8.63, 7.85 and 7.55 seconds, with 26 Jev calls and no
foreground planning each. Replay and cloning matched, with no gaps or fallback.
Reported cost was $0.00704 each; each cancelled one background preparation with
missing usage. `named-payment-controls/` preserves these repetitions.

The separate pilot probes in `execution-pilot-controls/` found Forest in 2/3
paid Vein searches and 3/3 paid Passage searches. All three Chocobo response
probes passed instead of using Burst. The latter policy asks Jev to decide what
is consequential; the failed choice cannot be attributed to missing purpose.
These archived policies and partial passes do not meet the execution gate.

## Scoped-plan full game

The same version-zero game continued at clean `abeacae`, with the carried
pregame, baseline roster and summary off. Red won on turn 13 by casting Burst
at Green's two life. Replay and full-game cloning matched, with zero gaps and
fallback. The journal, calls, report and timeline are under
`.pi/resume-20261007/scoped-full-game/next-version-gate-20261005-1791339573156.*`.

Wall time was 10m05s, play 10m04s and strategy wait 8m09s, against 5m26s, 5m25s
and 4m11s in the preceding game. The new run used 380 Jev calls and 53 strategy
attempts, with 19 foreground sessions, five help requests and one essential-step
repair. Six of twelve preparations were ready; all twelve consumed preparations
were amended. There were no timeouts, failures or truncations. Three cancelled
preparations lack usage. Reported totals: 2,456,304 input tokens, 308,224 cached,
65,469 output and $0.1592. Sixteen requests followed refusals: eight resource
conflicts, four missing comparison bounds, three other schema errors and one
invented action id.

Lifetime and payment delivery are better defined, but this game is a strategic
regression, not an accepted quality gate:

- Green correctly treats Zhao-tapped fetch lands as unavailable mana. At turn 9
  it still proposes Ascension followed by Hydra using the remaining Forest and
  a searched tapped Forest. The unchecked continuation is accepted and then
  requires an essential-step repair. A resource witness with unchecked effects
  is not a feasibility proof for the remaining line.
- Red animates Sanctuary during turn-10 upkeep using that Sanctuary and three
  Mountains. No tactical plan applies before draw; the standing card note does
  warn that this payment prevents an immediate attack. Jev spends the resources
  anyway. This is a standing-policy execution failure, not stale tactical prose.
- At turn 12, Red has untapped Kellan, Sanctuary and Zhao, five sources and burn;
  Green has four life and one 1/1 Hydra. The facts and action catalogue correctly
  include Sanctuary. The accepted line attacks only Kellan and Zhao, leaving
  a winning attacker idle. Its rationale says Sanctuary may attack "if desired"
  and counts Kellan's six only if unblocked. Hydra blocks it; only Zhao connects.
- At turn 13, Green again says Explorer cannot enable a land play without a land
  in hand, despite visible graveyard lands and its accepted permission. Another
  repair repeats the lost development. Red finally requests help and gets the
  explicit lethal Burst target.

`red-ready-lethal` freezes the new turn-12 draw position before the accepted
plan. Its physical win is the property, allowing attacks or burn. The existing
blocked-lethal case still tests a win requiring development before combat.
The next focused question is whether supplying the existing checked single-pair
combat arithmetic directly, beside every current creature, improves these
missed wins. It will not simulate future casts, choose attackers or certify a
whole combat.

The roster now includes that pair arithmetic from the existing core reader,
without changing the planner prompt, schema, model or effort. The damage
invariant checks the supplied values against physically executed first- and
double-strike combats. Types, all 179 tests and all 24 saved-position replay
checks pass. Live outcome probes follow separately.

At clean `59f1624`, `combat-facts-ready/` won 2/3 physical continuations through
turn 12. Both wins needed Red repairs, one and two respectively. The failed
answer described Burst plus three attacks in its audit prose but submitted
only `Finish attackers`. One winning answer called a two-damage Burst lethal
against four life; the other selected all three attackers but left incomplete
phase coverage. Their play times were 12.8, 30.9 and 67.3 seconds. Generation
and continuation together used 100 calls, 871,985 input tokens, 16,991 output
and $0.0450 reported cost; four cancelled calls lack usage.

`combat-facts-blocked/` won 0/3 through turn 14. The first cast Smaug but said
Explorer could block it, and invented trample on Explorer. The second spent on
redundant Kellan upgrades and kept the attackers back. The third explicitly
recognized that Explorer prevents Kellan's player damage, yet sent only Kellan.
Play times were 9.1, 37.5 and 7.6 seconds. Generation and continuation used 104
calls, 810,773 input tokens, 12,364 output and $0.0358; six cancelled calls lack
usage. Every clone and replay matched and every run had zero gaps or fallback.
There were no clean generated wins across the six trials. Supplied arithmetic
does not establish improved strategy. The review below retains these accurate
facts without claiming a selection improvement.

The remaining contradiction control also ran at `59f1624`. It repeats the
unchanged candidate-two Treasure plan, whose purpose spends Treasure while its
hold reserves Treasure until Smaug attacks. `execution-treasure-conflict-controls/`
won 3/3 in 7.86, 7.15 and 7.48 seconds, with matching replay/cloning and no gaps
or fallback, but failed the required help behavior 3/3. Jev always paid with a
Mountain and made no foreground help request. Each run used 26 Jev calls; their
reported costs were $0.00620, $0.00620 and $0.00657, each missing one cancelled
background call's usage. The physical win checker cannot score this exception
policy, so the trace audit overrides its displayed PASS for this question.

Both contradictory policies were visible. The held Treasure was labelled by its
token id, while the payment named Treasure. Also, `planning.spare` marks only
hold-preserving payments as fitting the step when such a payment exists. The
selected Mountain therefore carried the plan-step mark with the instruction
to pay Treasure, while the Treasure payment carried only its hold warning.
These findings were returned to the two continuing paseo-committee reviewers;
the protocol must not silently give either policy precedence.

## Holds describe conflicts without changing execution credit

The continuing paseo-committee reviewers converged on deleting `spare()`.
Every structurally matching payment now carries the step or branch mark and
execution policy, in canonical payment order. Spending a held resource adds
its warning; it does not remove execution credit or the announcement's policy
at resolution. This also prevents a completed cast from remaining unfinished
solely because its payment spent a held source. Locked action matching is
unchanged. Hold and attacker-tap marks use token names as well as card names;
the packet's hold list retains exact identity.

The existing invariant covers both payments, steps and branches, complete
option reachability, canonical ordering, hold release, and announcement policy
recovery after either payment. The token fixture checks readable Treasure
warnings and identity. The correction grants no precedence to a purpose or a
hold and does not parse either policy's prose.

The focused live gate repeats the unchanged contradictory Treasure plan three
times and the unchanged coherent two-Mountain plan three times. The former
requires help before announcement or spending; the latter requires the stated
payment without foreground repair. Both require matching replay and cloning
and no gaps or fallback. Wins are recorded separately. A failed exception
control does not justify reverting honest matching, claiming exception handling
works, or immediately starting another prompt variant. The committee retains
the accurate single-pair combat facts. Upkeep coverage, ordered stack waiting
and generation quality remain open work.

Types, all 179 tests and all 24 saved-position replay checks pass before the
live controls. The first test run exposed a missing test-only import; the
completed run includes its correction and the final canonical-order contract.

At clean `f15843b`, `hold-matching-coherent/` paid the specified two Mountains
(`1-19` and `1-25`) 3/3, with no foreground planning. Red won all three in
8.88, 7.33 and 7.39 seconds of play. Each run used 26 Jev calls and one cancelled
background preparation, with 167,602 reported input tokens, 2,434 output and
$0.00704; the cancelled call lacks usage.

`hold-matching-conflict/` still failed exception handling 3/3. Both payment
groups now carry the step and Treasure purpose, and the Treasure group also
names its hold, but Jev pays Mountain `1-19` without help every time. The three
physical wins took 7.46, 7.54 and 7.10 seconds. Each used 26 Jev calls and one
cancelled preparation, with 147,116 reported input tokens, 2,073 output and
$0.00618; the cancelled call lacks usage. All six continuations have no gaps or
fallback and match replay and cloning. The correction restores honest action
matching, not reliable contradiction detection. No new prompt variant follows
this failed control. The next separate execution question is ordered waiting
while effects from earlier commitments remain on the stack.

## Explicit waiting for resolution

Both reviewers converged on optional `waitFor: "empty-stack"` for a step or
branch, also available in current-response submissions. Ordered actions already
mean announcement order. A universal wait derived from earlier ledger rows
would alter intentional stacking, such as a second burn above an opponent's
Veil, and would lose its anchor when an amendment resets the plan revision.
The explicit prerequisite needs no lineage or new stored state. Absence keeps
legacy behavior; a retained commitment keeps its prerequisite after amendment.

Core derives waiting from current stack objects. Checklist, script and marks
show it without removing options, purpose or execution credit. A waiting step
keeps later commitments later, even if the waiting use has no current option.
Waiting grants no pass. Pass credit is unchanged: a structured `pass` denotes
that action, and a label saying "finish" cannot change its meaning.

The existing waiting invariant now covers landfall before an instant-speed
fetch, retained waiting after amendment, explicit response replacement, branches,
physical option access, early execution credit and policy recovery, deliberate
ordered stacking, and replay/clone reconstruction. Types, all 179 tests and all
24 saved-position replays pass. The planner's sequencing instruction was
replaced with the explicit field contract; the rest of its strategy prompt is
unchanged.

The next live control uses `stack-wait-controls.json`, derived from the existing
three Green execution controls. Only the land play and Passage activation gain
`waitFor`; removing those two fields reproduces each original plan exactly.
Grade whether Passage waits through the entire preceding landfall stack,
separately from outcome, subsequent repairs and target/search obedience.
Generated instant-speed continuations that omit a necessary prerequisite remain
planner omissions, not proof that the execution contract failed.

At clean `c80f30f`, `stack-wait-green/` passed waiting obedience 3/3. Each run
activated Passage at decision 540 with an empty stack, after both the original
landfall abilities and their reflexive rewards finished. Each searched for
Forest `0-21`, placed Hydra below the Ascensions in both landfall groups, and
targeted Hydra `0-49@3` with all four rewards. Replay and cloning matched, with
no gaps or fallback. These are supplied-line continuations through turn 13,
not generated wins or full games.

Two runs completed without foreground planning. The first asked for help at
clock 991, postcombat main, after all three commitments were done. Its packet
already contained explicit completion by passing and no additional selected
cast or land play; no changed source, target or payment justified that request.
The repair waited 26.74 seconds. Play times were 50.55, 26.08 and 24.77 seconds;
wall times were 51.77, 27.28 and 25.96 seconds. Total calls were 86, 83 and 83;
reported costs were $0.03236, $0.02583 and $0.02615. Across the three runs:
1,929,899 input tokens, 87,552 cached, 19,857 output, with three cancelled
background calls lacking usage. The prior Green controls took 56.62, 48.24 and
52.55 seconds and all needed repairs. The new waiting and target/search checks
pass; complete pilot obedience passes only 2/3, and generation remains unproven.

## Saved examples as references

The next generation experiment changes only where the saved pregame worked
examples appear. The blocked-lethal failures invent a trample race resembling
the combat example, whose hypothetical seat has six life against an 8/8 Hydra.
The real seat has eighteen life against a nontrampling Explorer. This resemblance
supports a test of interference; it does not establish the cause. Complete
attack dispositions would expose omitted commitments but could still encode
these deliberate defensive mistakes. They remain unadopted.

Both committee reviewers endorse one input-only arm in the shared runner.
`examples-lookup` uses production `planWork`, replacing each policy example with
a reference to its lossless lookup. Every policy, current fact, phase default,
submit field and reply budget stays unchanged. The ordinary path remains the
control. Offline checks restore the examples and compare the complete request,
task, SYSTEM and protocol. Carried briefs are never edited.

Run fresh paired controls and treatment at the same clean revision, alternating
order, three repetitions per Red position. Require three clean physical wins
in each position and improvement over control before the Green development and
defense gate. Record generation and execution separately: a winning initial
line that Jev misses fails clean execution without disproving the input
hypothesis. Log example lookups and whole-session latency. Reject adoption if
Red fails; record the outcome without another immediate prompt variant. No
full game precedes the Red and feasible Green gates.

At clean `a74e84a`, the paired runs used the same Jev/Luna-low roster, carried
briefs, summary off and physical turn boundaries: 12 for ready lethal and 14
for blocked lethal. Both arms used the ordinary planner during continuations;
only the initial treatment session relocated examples. The saved initial
requests differ by 6,305 characters: 79,841 to 73,536 for ready, and 81,545 to
75,240 for blocked. Restoring the five original examples makes every treatment
facts object equal to its control. The added lookup supplies them losslessly.

| Position and arm | Wins | Wins without Red repair | Wins without either seat repairing | Initial planning seconds |
|---|---:|---:|---:|---|
| Ready, production | 1/3 | 1/3 | 0/3 | 10.87, 5.72, 6.60 |
| Ready, lookup | 3/3 | 3/3 | 1/3 | 7.46, 7.88, 4.20 |
| Blocked, production | 0/3 | 0/3 | 0/3 | 10.06, 6.68, 5.54 |
| Blocked, lookup | 0/3 | 0/3 | 0/3 | 17.31, 21.43, 17.87 |

Complete winning commitments appeared in 2/3 ready control plans and 3/3
treatment plans, including the two-spell burn line. That generation difference
is one run, not the two-run difference in physical wins. Three repetitions do
not establish an improvement in planning strength.

Ready treatment used no example lookup. Its first two answers selected all
three attackers and won; Green requested defensive help once in each run. Its
third answer selected Lightning Strike and Burst at the opponent, with an
empty-stack prerequisite on Burst, and won without any foreground planning.
The first answer still calls Kellan plus Sanctuary "guaranteed 9 damage" despite
a blocker. The second uses an opponent-life bound of three for Burst while its
purpose permits casting only at two or less. Winning commitments do not make
these execution policies coherent.

The ready control's second answer invents Sanctuary's summoning sickness and
claims blocked Kellan deals its second-strike damage to the player. Its third
answer includes all three attackers, but Jev asks for help while Sanctuary and
Zhao are available and then finishes with Kellan alone. Repairs do not recover
the win. This is an execution failure alongside a planner window mismatch:
Burst's broad own-turn window allows it before combat, despite its stated
postcombat purpose. Do not count this as an omitted-attack generation failure.

Every blocked treatment retrieved the combat example before submitting. Across
those sessions, seven example lookups occupied four replies; sequencing,
resources and recovery were also fetched. The initial request excludes examples,
but the later replies read them again. The first answer casts Smaug without
selecting its attack: its steps select Kellan and Sanctuary while its phase
orders Smaug alone. It also tells Jev to pay with both Sanctuaries despite
selecting the animated Sanctuary as an attacker. Repair attacks with Kellan and Smaug,
leaving no win through Explorer's block. The other two answers deliberately
attack with Smaug alone, preserve ground blockers, and call Explorer an 8/10
trampler. One calls eight damage lethal at eighteen life. These are generation
failures with the current facts supplied, not merely failed pilot execution.

All twelve continuations have zero gaps and fallback and match replay and their
cloned prefixes. Initial planning plus play used 394 calls: 339 Jev and 55
strategy, with 3,214,960 reported input tokens, 418,816 cached, 44,900 output and
$0.15212. Twenty-four cancelled background preparations lack usage; the price
is the reported total, not an estimate for those missing calls. There were no
failed or truncated calls. Combined planning/play costs by three-run group were
$0.04230 ready control, $0.02300 ready lookup, $0.04107 blocked control and
$0.04575 blocked lookup. Play times were respectively 19.85/15.57/24.83,
10.75/9.93/4.13, 12.72/8.99/28.23 and 26.13/10.81/10.16 seconds.

Reject adoption. The ready result is a small observed improvement; the blocked
result fails generation and the adoption gate. Because lookup use differs,
this comparison does not isolate permanent removal of examples. Keep the arm
for reproducibility and keep production unchanged. No Green gate, full game or
new prompt variant follows this failed gate. Evidence is in
`.pi/resume-20261007/examples-ready/`, `examples-blocked/` and
`examples-audit.json`; each directory saves initial replies, physical journals,
call traces, reports and timelines. Types, all 179 tests and all 24 saved-prefix
replays passed before the clean-source live comparison.

Both reviewers confirm rejection. Jev's premature attacker completion repeats
the ready-lethal execution failure at `59f1624`; the complete winning attack
set was available in both cases. A factual finish-option mark naming the planned
attackers still undeclared is a separate execution proposal. It must retain the
finish option and cannot claim obedience merely because the mark is rendered.

## Premature attacker completion

The next execution control freezes version 365 of the ready control's third
run, after Kellan is selected. One prefix ends before any help request; another
contains both accepted repairs. The accepted remaining steps are Sanctuary,
Zhao, then finishing. Both attackers are physically offered; either may go first.
The second pilot case adds the exact saved help-budget refusal to the frame.
Physical controls start before help and count both attackers selected before
`attack:done`, help before that finish, and wins separately.

The first baseline attempt at `f05ae22` made no inference calls: all three
continuations stopped because their cloned prefix already held the runner's
fixed `benchmark-proposal` action ID with a different earlier plan. Core's
idempotency rejection was correct. The runner now chooses the first unused
proposal ID for that seat from its copied work history. This changes only
benchmark bookkeeping. Repeat the unchanged baseline before adding the mark;
these failed attempts are not gameplay evidence.

Review also found that freezing only the post-repair prefix omits the help
loop and its transient refusal. The two pilot cases preserve those separate
questions. The physical `continue` case now resumes the original accepted work
without installing a proposal, retaining completed steps and available help
budget. It replaces the redundant supplied-plan copies. This restores the
measured decision sequence before testing the new mark.

At clean `8a29457`, `finish-mark-before-resume/` won 3/3 with all planned
attackers selected and no Red help. Green needed two, two and one foreground
repairs. These resumed games do not reproduce the original classifier question:
the new loop's first `since` projection contains the whole visible receipt
history, adding 104 `known` lines. Its physical position and plan progress match.
Keep that limitation in the comparison; a later 3/3 result cannot establish a
win-rate improvement over this baseline.

The isolated pilot cases in `finish-mark-pilots-before/` reproduce both original
requests exactly, including state and classifier criteria: original call 15
before help and call 21 after the budget refusal. Before help, Jev selected a
planned attack 1/3. After refusal it did so 0/3. The finished-declaration and
summoning-sick counterexamples both passed 3/3. These are decision probes,
not physical continuations or wins.

The new finish mark reads only due structured matches. Each available unfinished
attack step names its offered choices; multiple choices remain alternatives.
Done steps, false conditions, unavailable attacks and optional branches contribute
nothing. A step that itself matches `attack:done` is not falsely labelled
unfinished. Every option, canonical order and execution credit remains intact.
The extended marks invariant covers both attack orders, shrinking marks, early
finish credit, unchanged state and reconstruction after cloning and replay.
Displaying the fact alone establishes no pilot obedience.

At clean `b426b60`, both exact pilot probes passed 3/3: Jev selected Sanctuary
instead of asking for unchanged-plan help or finishing early. The two completion
counterexamples still passed 3/3. Comparing before/after requests shows only the
finish option's `shows` and `notes` changed; classifier criteria stayed identical.
This is a narrow observed improvement in following available commitments,
including after help refusal, not proof of general exception handling.

The three physical continuations in `finish-mark-after-resume/` all selected
Sanctuary, then Zhao, then finished, and won with no Red help before finishing or
later in the turn. That matches the resumed baseline's 3/3. Green requested one,
two and two repairs. All six physical runs have zero gaps/fallback and matching
replay/clone. After play times were 13.02, 12.59 and 11.12 seconds, against
13.55, 12.55 and 13.85 before. Do not attribute those small timing differences
to the mark; opposing repairs differ.

The twelve pilot calls per arm reported 47,865/48,435 input tokens, 564/579
output and $0.00201/$0.00203 before/after. Physical continuations used 43 calls
before (32 Jev, 11 strategy) and 44 after (33 Jev, 11 strategy), with
324,418/331,217 input, 40,448/56,832 cached, 3,643/3,701 output and
$0.01586/$0.01466. Each physical arm has six cancelled background preparations
with missing usage. None of the measured calls failed or truncated. The compact
trace audit is `.pi/resume-20261007/finish-mark-audit.json`.

Both reviewers support retaining the factual mark and the narrow pilot result.
Resume context continuity is now an explicit open defect: `play()` initializes
its per-seat receipt cursors anew, so the first resumed packet repeats history
that the parent pilot had already seen. The physical baseline did not reproduce
the failed parent question. These runs establish observed outcomes and
execution/replay/clone health, not a repair of the parent's behavior. Until that
context discrepancy is resolved, use exact saved packets to support pilot
behavior claims. No full-game gate follows; generation and upkeep coverage
remain open. Types, all 179 tests and all 27 saved-position replays pass.

## Receipt continuity

The next correction addresses the resumed context discrepancy before another
behavior comparison. A new assertion in the existing clone invariant failed at
decision 40: the resumed packet repeated nine old receipt lines that its parent
omitted. The physical table and remaining frame fields matched. The failed
check is saved in `.pi/resume-20261007/receipt-continuity-before.log`.

`sinceDecision` now derives the receipt boundary from the seat's latest
`chosen`, `declared` or `fallback` row, excluding judge-authored rows. It includes
that action's own receipts. Forced and delegated rows extend the history without
resetting it. Before any qualifying row, the window starts at setup. The loop's
answer and observation frames and the benchmark pilot runner share this reader.
Help, work, refusals and unavailable answers consume nothing. Rollback reads the
kept branch; there is no stored cursor to repair.

The review also found that receipt history entered strategy through live loop
frames. An offline recount confirmed 53 strategy requests in the scoped full
game with zero or one receipt line, but four of thirteen requests in
`combat-facts-blocked/calls.jsonl` with 211 lines. Strategy facts now omit only
`view.since`; structured `actions` and `history` remain. Generic projections,
`workFrame`, spectators and explicit receipt-index slices retain their previous
semantics. This is an input continuity correction, not evidence of stronger
planning.

The offline gates now establish:

- Every subsequent full frame in the scripted parent and clone matches.
- The actual partial declaration at decision 365, reached continuously after
  Kellan from decision 364, produces the same full Jev packet and question as a
  clone resumed at 365. Its `known` has two seat facts and no repeated receipts.
- The same comparison passes through help, `plan.keep`, an invalid pick and its
  refusal retry. Foreground strategy facts match the saved-position facts at
  the help boundary and are independent of the pilot receipt slice.
- Unavailable answers, explicit work, forced/delegated rows, fallback passes
  with no receipt, multiple receipts, rollback, purity and event-time visibility
  retain their stated behavior. Types, 179 tests and 27 saved replays pass.

These checks establish continuity of facts derived from the table. Unaccepted
background preparation, inspection progress, summary recaps and retry text are
not journaled and restart on resume. Continuation reports must retain preparation
timing; summary remains off in comparisons. Historical packets from unrecorded
looks cannot be reconstructed. This limitation covers both pilot behavior and
strategy calls inside older physical continuations; their observed outcomes and
replay results remain facts. Initial planning probes built from `workFrame` did
not receive the repeated receipt history.

At clean `8cdeef3`, `receipt-continuity-play/` ran three bounded live
continuations through turn 12. Each first Jev request matches the exact saved
post-mark probe, including the complete question. All three selected Sanctuary,
Zhao, then finish, and won without Red help. Green requested two foreground
repairs in each. Play took 12.48, 11.48 and 11.44 seconds. Every run has zero
gaps/fallback and matching replay/clone results. These are continuation controls,
not a strategy-generation gate or evidence of general exception handling.

The child reports record 42 calls (30 Jev, 12 strategy), 314,840 input tokens,
40,448 cached, 3,763 output and $0.01664 reported cost. Six cancelled background
preparations have missing usage; none failed or truncated. Their timing remains
in the child reports. `receipt-continuity-play/audit.json` records the actual
picks and exact first-packet comparisons.

The parent benchmark printed zero calls because it counted only initial
planning, excluding physical continuations. The child reports were complete;
the counts above come from them. The runner now includes continuation calls in
each case and the aggregate bill, and its console reports whole-case elapsed
time. This reporting repair changes no model request or game decision.

One accounting smoke at clean `ff5a88f` in `receipt-accounting-live/` confirms
the parent call records, case count and complete usage report exactly equal the
continuation's records. It again selected both remaining attackers, won without
Red help and passed replay/clone with zero gaps/fallback. Green made two repairs;
one strategy WebSocket error retried successfully. The displayed 15 calls include
that failed attempt and two cancelled preparations, all three without usage.
Reported input was 104,810 tokens, cached input 19,456, output 1,220 and cost
$0.00499. Play took 17.90 seconds; the complete benchmark case took 20.54 seconds.
Types, all 179 tests and all 27 saved replays pass at this code revision.
