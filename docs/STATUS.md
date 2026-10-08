# Gameplay status

Jev pilots, Sol 6.1 high prepared the carried matchup briefs, and Luna low
writes strategy and judges. The roster stayed fixed. Playing strength remains
unproven. The retained changes reduce measured response-planning work, repair
one execution case, clarify projected facts and correct benchmark grading.
No coded lethal search, move filtering or automatic voluntary choice was added.

## Retained changes

Analysts now read projected facts followed by revisable pregame matchup advice.
Notebook entries and standing intent reach only the coordinator. Restoring the
advice repairs an information loss from the previous split. It showed no
improvement in the sampled growth continuations: six per arm found zero wins.
Initial reported cost rose from $0.103 to $0.144. The previous 47% input and 29% cost
reductions measured efficiency without measuring gameplay quality.

Valid inherited opponent responses ask opponent, defense and removal in
parallel, then the coordinator. Own-turn work, preparation and invalid-plan
repair retain the full survey and six outlooks. The current editor binds
actions to the actual decision and distinguishes priority from declaring
blockers. Discarded preparation still cancels every round; invalid inherited
plans still unlock the full editor.

Jev's card-use question now asks it to choose under the phase policy and
unfinished plan. The previous instruction to choose a prepared use confused
accepted card terms with a planned action. In the saved Kellan packet, the
control spent Zhao's mana on an upgrade in 10/10 repeats; the candidate
preserved it in 10/10. In three physical continuations per arm, Zhao reached
the battlefield in 0/3 controls and 3/3 candidates. Every continuation had
zero gaps or fallback and matching replay and clone checks. Repeated packets
measure stability in that position, not an independent game success rate.

Player target labels now include public name, seat and player type, such as
"player Green (seat 0, opponent)". Only player labels and matching criteria
changed in paired requests. Ten fresh picks per saved packet changed the older
Smaug case from 0/10 to 10/10 and the final-k case from 6/10 to 10/10; supplied
player-policy picks stayed 10/10. Attack, Zhao and Kellan reserve probes stayed
3/3 in both arms; the Chocobo response scored 0/3 in both. Offline execution
of six captured picks confirmed the locked targets and full replay/clone parity.
This supports the combined player-type/name label change on saved packets,
not targeting reliability in new games.

The mana forecast releases holds at their scheduled windows. Effect-dependent
release conditions still use current facts rather than predicting effects.
Future-action entries omit unrelated graveyard and exile copies while keeping
accepted uses and land permissions. Dossiers distinguish registered watches,
current selector matches and observed waiting triggers; they also show pending
combat declarations and explicit creature sickness status. These are factual
repairs, without a measured playing-strength claim.

Findings and outlooks missing required fields get one repair attempt, then
reach the coordinator as failures. Help reasons record observations; the
strategy request and submit schema define the reply. Output ceilings are
requested provider limits. The installed Pi Codex route can ignore them, so
the ledger records truncation from the provider's stop reason.

## Scoped response comparisons

| Frozen positions | Full path | Short path | Median initial planning, full to short |
| --- | --- | --- | --- |
| Nine help frames from seed l | 9/9 healthy | 9/9 healthy | 32.4s to 18.2s |
| Six actual blocking positions | 6/6 healthy | 6/6 healthy | 41.6s to 27.2s |
| Three direct postcombat Hydra responses | 3/3 removals | 3/3 removals | 97.6s to 32.5s |

Initial reported costs fell from $0.198 to $0.043 across the nine help frames,
and from $0.150 to $0.029 across the blocking probes. Blocking repairs used
four calls instead of about seventeen. Both paths avoided a lone illegal
block against menace. One short help-frame continuation requested another
session. The direct Hydra probes paid with unrestricted Mountain mana and
killed the 1/1 before the pending land entry. These scoped results do not
establish full-game speed or playing strength.

## What remains unresolved

Strategy still misses the supplied turn-7 growth wins: Surrak from 4 to 8 to
16, and Hydra to 24 after warped Harmonizer and two Tunnel entries. Jev has
executed both witnesses. The first accepted plan is graded before an
irreversible land choice, separately from the physical outcome. Source,
cost, window and order checks do not certify targets or power arithmetic.

The alternatives bundle, independent damage analyst, sectioned inspection
and damage analyst without advice each scored 0/6 on the initial sequence
property. These small screens did not justify retaining those prompt changes.
Full Tunnel and Harmonizer text was present. Replies still omitted Tunnel's
search, played a land before its payoff, spent an Elf and counted it attacking,
or rejected Harmonizer because it could not itself attack. Removing advice
from the damage analyst did not establish that advice was the main cause.

Both coordinator-example arms scored 0/3 for hold authoring and 0/3 for a
response policy covering the opponent's whole turn. Earlier passes measured
acceptance only. Broader response-editor experiments did not improve both
Elf preservation and Hydra removal and remain outside production. Own-turn
shortcuts were also removed after counting a summoning-sick creature as an
attacker. Full own-turn writers also leave tactical choices in unread rationale
and clear execution policies. In final l, that lost Kellan and a later block.
Reliable response authoring and broader pilot adherence remain unresolved.

## Matched games and validation

These whole-game comparisons use control `54fcc16` and candidate `62de8c1`,
before the later player-label change:

| Seed | Arm | Result | Wall time | Reported cost | Help |
| --- | --- | --- | --- | --- | --- |
| k | Control | Red turn 12 | 13m47s | $0.525 | 0 |
| k | Candidate | Red turn 10 | 13m07s | $0.692 | 3 |
| l | Control | Green turn 7 | 7m29s | $0.334 | 1 |
| l | Candidate | Green turn 13 | 17m13s | $0.897 | 2 |

All four finished with zero gaps or fallback and matching replay and complete
final-state clones. They do not establish stronger play or lower full-game
cost. Candidate l had two 150-second strategy timeouts and one WebSocket
failure. Strategy wait was 10m53s for candidate k and 14m26s for candidate l;
valid short response repair ran once in k and never in l.

The comparisons reuse identical version-zero tables and carried preparations,
with normal seating enabling turn planning in both arms. Summaries are off.
Opening decisions can differ, so matching the seed does not match later boards.
Reported costs cover returned usage; canceled or failed calls can lack cost.
Missing usage affected five control-k calls, one candidate-k call and three
candidate-l calls; control l had none.
Replay and clone parity establish consistency, not rules legality.

All 181 offline tests, type checks and saved-prefix checks pass. New physical
fixture checks require a completed continuation boundary or actual outcome;
an earlier decision limit cannot pass them. They check Elf preservation, Hydra
removal and Zhao's entry rather than treating acceptance as success.

Raw requests, replies, interrupted runs, failed patches and audits remain in
ignored `.pi/round3-20261008/`. Reusable positions and execution witnesses live
in `test/fixtures/benchmarks/`, outside the published package. The
[benchmark runner](../tools/benchmarks/README.md) documents what each check
establishes.
