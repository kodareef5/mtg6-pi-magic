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

The remaining variants did not improve the complete Red commitment. None was
adopted. Their experimental protocol also needs care: combat keys could appear
in the before-combat list, and a first valid proposal on the last reply could
exhaust the confirmation round. Rejected protocol answers are not all proof of
failed tactical recognition. These limitations stay separate from the recorded
false source and damage claims.

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

The reviewer comparison and a full game from version zero are in progress.
The full game uses production planning and carried preparation. Experimental
proposal and instruction renderers remain outside the production path.
