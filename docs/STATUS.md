# Gameplay status

Jev pilots, Sol 6.1 high prepared the carried matchup briefs, and Luna low
writes strategy and judges. The roster stayed fixed. Playing strength remains
unproven. No coded lethal search, move filtering or automatic voluntary choice
was added.

## October 8 pilot overhaul

A lab now re-asks the pilot about real logged decisions under candidate code
(`--corpus` in [the benchmark runner](../tools/benchmarks/README.md)). It rebuilt
all 2,019 decisions from six games byte for byte. A gold set of 147 decisions was
labelled twice, blind to the pilot's answers and later events; each arm ran the
gold items and 400 others five times, with a control in every round.

| Arm, cumulative | Gold accuracy | Due step | Nothing planned | Unneeded help | Median request |
| --- | --- | --- | --- | --- | --- |
| Before | 0.83 | 0.90 | 0.70 | 0.07 | 11.0 KB |
| One id per physical action | 0.86 | 0.96 | 0.73 | 0.06 | 11.0 KB |
| Criteria from each option's facts and plan marks | 0.89 | 0.96 | 0.87 | 0.02 | 10.8 KB |
| Short orientation, pass rules removed | 0.92 | 0.98 | 0.93 | 0.00 | 9.3 KB |
| Plain watches and events, opening facts | 0.91 | 0.98 | 0.95 | 0.00 | 7.2 KB |

The planned cast is now offered once; each criterion states what its option does,
its facts and the plan's marks; target labels name the target, its controller and
body; effects read as words; the pass option says what passing does, and nothing
grants or withholds a pass; a phase that asks for help says so on the help option;
the opening states play or draw and land odds. A lone block on menace is now
stated as illegal at the finish. Strategy no longer accepts a draw-step stop that
already holds, and a declared attack is never reported missing at a priority.

The 26 saved pilot cases went from 58/78 to 66/78 with no case worse; the menace
finish wording then fixed the partial-block case (5/5). Trigger order remains
weak (about half of seven gold items): plans state resolution order and the pilot
tends to put the first-named trigger on first.

Games from version zero on `d68a146` and `219bab6`, one per seed, all with zero
gaps or fallback and matching replay: m Red turn 12 (8m44s, $0.55, help 1),
k Green turn 11 (8m37s, $0.50, help 2), l Green turn 7 (3m48s, $0.25, help 0),
n Green turn 11 (7m24s, $0.47, help 2), p Red turn 14 (8m56s, $0.64, help 0).
Seed k had not been won by Green before. One game per seed does not establish
playing strength. Three games at once exceeded the strategy provider's rate limit;
two at a time did not.

## October 8 strategy overhaul

A review of the strategy requests found the prompts teaching the wrong game.
The win count named attackers, haste and burn but not growth, and 32 of 60
Hydra coordinators rejected Harmonizer because it could not attack. The pregame
brief filled about 71% of every dossier, sat last before the request, and its
worked examples put absent cards such as Resolve into later hands. 181 answers
said summoning sickness stops blocking. Decisions left in unread rationale,
`phases: []` wipes and step-only opponent policies lost intent before Jev.

Retained, in five commits from `eed3495` to `260fd03`:

- Rules of play lead with blocking, limit sickness to creatures, and state that
  tapped creatures cannot attack, a permanent taps once, land entries trigger
  landfall, and until-end-of-turn bonuses add to later counters.
- The dossier no longer offers a land play on the opponent's turn, names the
  seat's own draws, evaluates registered entry conditions, scopes sickness by
  turn, lists lands' accepted activations and hands' accepted casts with their
  costs, and puts visible card text first. Reuse keys cover the seat's own cards.
- The win counts everything before combat, land entries and doublings included.
  A larger damage claim must be recounted and repaired before it is rejected.
  Responses assess the threat and their answers instead of an own-turn win.
- Plan objective and guidance leave the submission; the assessment fills them.
  A turn or preparation requires `theirTurn`, a policy for the whole opponent
  turn. Phases merge by window and `[]` cannot wipe them; written phases state
  completion; a stop that already holds is refused. Pregame step notes stay
  pilot guidance instead of inherited phases.
- The matchup plan sits before the facts, keeps worked examples behind a
  lookup, shows notes only for visible cards, and gives responses only their
  response and combat policies.
- Own turns and preparations ask one branch analyst per first action beside the
  focused questions, instead of attack, ordering and zones questions followed by
  six outlooks. Analysts time out after 45 seconds.
- A repair during the opponent's turn no longer discards the next turn's
  preparation, which had forced an extra full session at upkeep.

Saved-position screens, initial plans only. The first column is the rules,
facts and wording commit alone; earlier October 8 arms scored 0/6 on growth
and 0/3 on both authoring cases.

| Case | Rules and facts only | All changes |
| --- | --- | --- |
| Lethal set, five cases | 13/15 | 13/15 |
| Median lethal planning | 35.8s | 24.8s |
| Opponent-turn response authoring | 0/3 | 3/3 |
| Own-step reserve authoring | 0/3 | 0/3 |
| Surrak and Hydra growth sequences | 1/12 | 1/12 |

Matched games from version zero with carried preparations. Seeds k and l
compare with the final `62de8c1` games below; seed m with `de643a5`.

| Seed | Before | After | Wall time | Strategy wait | Cost | Help |
| --- | --- | --- | --- | --- | --- | --- |
| m | Red turn 12 | Green turn 7 | 14m57s to 5m30s | 13m00s to 4m10s | $0.98 to $0.31 | 3 to 1 |
| k | Red turn 10 | Red turn 10 | 13m07s to 7m31s | 10m53s to 5m35s | $0.69 to $0.49 | 3 to 3 |
| l | Green turn 13 | Green turn 11 | 17m13s to 10m43s | 14m26s to 7m52s | $0.90 to $0.68 | 2 to 4 |
| n | - | Green turn 11 | 10m11s | 7m54s | $0.57 | 5 |

Every game finished with zero gaps or fallback and matching replay. Seed m's
turn-7 win was the growth line the fixtures look for: warped Harmonizer, then
Elven Passage played and sacrificed, doubling Chocobo twice for 22. Seeds k
and m games used `710b5e1`; l and n used `260fd03`, after the phase fix (the
`710b5e1` l game won on turn 13 with nine help requests, mostly windows whose
inherited step-note scripts granted no completion). One game per seed does not
establish playing strength.

## Retained changes

Analysts receive projected facts and revisable pregame matchup advice.
Notebook entries and standing intent reach only the coordinator. Restoring the
advice repairs an information loss from the previous split. It showed no
improvement in the sampled growth continuations: six per arm found zero wins.
Initial reported cost rose from $0.103 to $0.144. The previous 47% input and 29% cost
reductions measured efficiency without measuring gameplay quality.

Valid inherited opponent responses ask opponent, defense and removal in
parallel, then the coordinator. Own-turn work and preparation now ask first-action
branches beside focused questions; invalid-plan response repair retains the full
survey and six outlooks. The current editor binds
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
16, and Hydra to 24 after warped Harmonizer and two Tunnel entries. Branch
analysts claimed 16 for Surrak in two of twelve October 8 runs; the
coordinator adopted one and refuted the other with a false entry count. Hydra
branch arithmetic still undercounts doubling. Moving the step notes out of the
analysts' dossier scored 0/12 and was not kept. Jev has
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

Own-step reserve authoring still scores 0/3; the whole-turn response policy
now scores 3/3 through the required `theirTurn`. Earlier passes measured
acceptance only. Broader response-editor experiments did not improve both
Elf preservation and Hydra removal and remain outside production. Own-turn
shortcuts were also removed after counting a summoning-sick creature as an
attacker. Full own-turn writers also leave tactical choices in unread rationale
and clear execution policies. In final l, that lost Kellan and a later block.
Elf preservation and Hydra removal stay at one of three or none at both the
base and the final commit. Help requests remain at one to five per game, mostly
the pilot asking in windows where nothing is due or before a due step.
Broader pilot adherence remains unresolved. A fresh Sol pregame timed out its
matchup analyst three times at 240 seconds for both seats on October 8.

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

All 191 offline tests, type checks and saved-prefix checks pass. New physical
fixture checks require a completed continuation boundary or actual outcome;
an earlier decision limit cannot pass them. They check Elf preservation, Hydra
removal and Zhao's entry rather than treating acceptance as success.

Raw requests, replies, interrupted runs, failed patches and audits remain in
ignored `.pi/round3-20261008/` and `.pi/claude-20261008/`. Reusable positions and execution witnesses live
in `test/fixtures/benchmarks/`, outside the published package. The
[benchmark runner](../tools/benchmarks/README.md) documents what each check
establishes.
