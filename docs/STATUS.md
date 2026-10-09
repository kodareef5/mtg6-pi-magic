# Gameplay status

Jev pilots, Sol 6.1 high prepared the carried matchup briefs, and Luna low
writes strategy and judges. The roster stayed fixed. Playing strength remains
unproven. No coded lethal search, move filtering or automatic voluntary choice
was added.

## October 9 strategy-owned trigger order and the loop guard

A review of the pair questions found three problems: groups played with options
reversed lost the plan's order more often than control (15/24 against 20/24),
contradictory pair answers became an invented "stated order", and the lab
dropped trigger frames (concurrent requests overwrote the captured first
request, and later puts read an order cached only in the live seat).

Strategy now owns trigger order. A plan's `triggers` lists trigger sources in
resolution order, with optional named targets (a query, `"opponent"` or
`"self"`). The table marks the put that goes on now, in placement order and
aiming at any named target; a named target also marks a lone trigger. The
pilot still picks each put, and each put remains an objectable ledger row. The
writer's dossier names its watches that fire on the same event and says their
order is the writer's to state.

Without a plan order the pilot is asked each pair in both orientations; an
order is stated only when every pair agrees both ways and the pairs are
consistent, otherwise the put is asked plainly. Pairs are asked again at each
put, a size refusal skips them, and the lab keeps the first concurrent request.

| Check | Main | Pairs, one orientation | Pairs, agree or abstain | Strategy order |
| --- | --- | --- | --- | --- |
| Played groups keep the order, all 48 (original and supplied, both option orders) | 36/48 | 39/48 | 41/48 | |
| Played groups, options reversed, supplied policies | 11/12 | 6/12 | 10/12 | |
| Played groups with a structured order, both option orders | | | | 24/24 |
| First put follows the plan (10 labelled items) | 0.62 | 1.00 | 0.96 | |
| Codex's supplied-policy cases | 80/80 | 80/80 | 80/80 | |

The structured order's 24/24 includes target, final size, replay and no gaps.
Two bugs it exposed are fixed: a named target unmarked a trigger that chooses no
target (Ascension's landfall, whose payoff targets later), and equal-rank
triggers were listed in option order, so the mark and the question disagreed
when options were reversed. Writer uptake in games went from 0 Green plans with
an order (n) and 2 marked puts (m) to about half of Green's plans with an order
once the dossier named the triggers that fire together: 6 and 13 marked puts.

Seed n then exposed an unbounded loop: one Harmonizer remained, the plan
double-blocked menace Zhao with two, and the pilot added and withdrew the same
lone block about 9,000 times. The core loop now fingerprints each decision with
the position and the seat's plan revision. From the second visit in a step the
seat is told; at the third the table asks strategy for a new plan within the
turn's requests; past them play stops with a loop gap. The seat also bounds one
decision's inspection walk. Live on the frozen position (`block-loop-recovery`),
all three runs began the same toggle, the table raised the loop at the third
visit, strategy repaired, and the pilot finished a legal declaration.

Health games on the merged code, from the carried version-zero preparations:

| Seed | Result | Wall time | Green plans with an order | Puts under a plan order | Help |
| --- | --- | --- | --- | --- | --- |
| n | Green turn 11 | 8m29s | 9 of 28 | 7 | 2 |
| m | Green turn 7 | 6m25s | 8 of 14 | 5 | 0 |

Both have matching replays, no gaps and no loop requests. One game per seed
does not show playing strength.

## October 9 trigger order questions

Plans state trigger order as resolution order ("resolve Hydra, then Ascension,
then Harmonizer"), and the pilot put the first-named trigger on first, which
inverts it. Code does not stack triggers for the pilot. Before two or more of its
triggers go on the stack, the seat asks Jev, one pair at a time, which should
resolve first. Each answer states both directions ("A resolves before B, so B
goes on the stack first"), so it reads the same against either wording. The
answers move nothing. Each put stays its own decision and ledger row, which the
opponent can object to. The put question gives the stated order as placement
order and marks the option that keeps it. Separately, the trigger question's
reversal rule became "Choose targets as your plan gives them". Requests outside
trigger decisions are byte-identical.

Two blind labellers added six agreed trigger items to the gold set, giving 21
trigger decisions (10 order, 10 target, 1 due step). Control is `16309d0`.

| Check | Control | Retained |
| --- | --- | --- |
| First put follows the plan's order (10 items, 5 repeats) | 0.62 | 1.00 |
| First put has the plan's target (10 items) | 0.84 | 0.92 |
| Whole stated order keeps the plan (10 items) | - | 49/50 |
| Played-out groups keep the plan's order, options as listed | 16/24 | 24/24 |
| Played-out groups keep the plan's order, options reversed | 20/24 | 15/24 |
| Codex's supplied-policy cases | 80/80 | 80/80 |
| Saved pilot cases (3 repeats) | 76/93 | 82/93 |

The target line alone moved the first put from 0.62 to 0.82. Measured
alternatives for the order questions did worse: one list question ("which
resolves first?") drew the first-listed trigger, 19/50 whole orders; a
resolution order given at the put drew the first-named trigger onto the stack;
claim-shaped list options reached 25/50; asking each pair in both orientations
(by votes or summed probabilities) reached 41/50. In the counterbalanced runs a
pair's two orientations agreed 88% of the time on items whose plan states an
order, so the answers carry the plan's order rather than position alone. The
reversed-option result remains a real weakness: some pairs still lean on
position, so a game whose triggers were created in the opposite order can see a
wrong stated order, which the pilot then follows. Plans that state order
ambiguously ("arrange Hydra, Ascension, then Harmonizer") or contradict
themselves remain authoring problems no question can recover. Raw runs, labels
and harnesses are under ignored `.pi/jev-lab/`.

Health games on the retained code, resumed from the carried version-zero
preparations, two at a time:

| Seed | Result | Wall time | Help | Notes |
| --- | --- | --- | --- | --- |
| m | Green turn 7 | 3m23s | 0 | Harmonizer put on under both Chocobo counters, as planned |
| n | stopped turn 11 | 9m27s | 3 | a 212-power earthbent Forest's damage split overran Jev |
| n (after the fix below) | Green turn 11 | 9m52s | 4 | |
| k | Red turn 10 | 7m03s | 0 | |

All four have matching replays; the finished three have no gaps. In n the
pilot resolved Ascension's counter before Harmonizer's power doubling on each
entry, and the Forest reached 212 power with trample. The table listed all
211 damage splits, Jev refused the request (`max_tokens_exceeded`) and the
game stopped. Option count is not the limit (670-option requests have
succeeded); digit-heavy text is. The adapter now raises `RequestTooLarge` for
that refusal, and the seat asks the same decision again with half as many
options per question, so inspection splits it into ranges; nothing is cut.
The stopped position is `pilot-trample-assignment`: 3/3 live, each one refused
call and two narrowed questions. One game per seed does not show playing
strength.

## October 8 review and cleanup round

The [round plan](IMPROVEMENTS.md) pins control `f5ad823`. Retained code is
`eacc878` and `b5dec02`; the roster stayed fixed. Raw requests, replies, supplied
policies, failed harnesses and rejected prompt experiments remain under ignored
`.pi/round4-20261008/`.

Instruction summaries now preserve accepted selector restrictions, both
condition bounds and characteristic changes, using exact terms when prose
cannot carry them. The coordinator's reserve example releases held sources at
postcombat main. A supplied reserve actually casts Zhao after combat with zero
help or gaps and matching replay and clone checks. This proves execution of
that reserve, not that the writer will author one.

Branch coverage now distinguishes actions by their accepted meaning instead
of their labels, checks projected source zones and permissions, and queues
every distinct candidate with at most eight calls at once. The coordinator
receives candidate, alias, report and failure counts, plus the exact first
action's terms. Equal labels no longer merge different costs or modes. The
matched and fresh candidate games include nine- and ten-candidate requests
with every report returned. Extra candidates can still add time and cost;
coverage does not certify affordability, timing or arithmetic.

Trigger questions explicitly ask for targets and distinguish placing triggers
from their resolution order. With supplied placement and target policies,
ten fresh repetitions improved from 50/70 to 69/70 correct first choices.
Required help remained 10/10. All 24 physical continuations passed, including
reversed option order and partial queues, with full replay and clone parity.
These are four witnesses from two related trigger families. One supplied
order gives Hydra 14/5 where another order can give 16/6; this measures policy
obedience, not optimal trigger order. An authoring add-on still produced
contradictory orders and was rejected.

A reviewer labelled 22 fresh pilot frames before reading repeated answers:
17 scored and five excluded. Control and candidate both scored 45/51, with
the same six misses. One block policy asks for a tapped Sanctuary as a third
blocker while also asking to minimize damage; its help requests are ambiguous.
The clear schedule departure is now `pilot-future-step`: Burst is scheduled
for precombat main, but Jev casts it during draw in all three repeats in both
arms. Its timing survives every inspection request. Earlier casting is legal
and can win; the failure is obedience to the accepted schedule.

### Growth experiments

All arms used Luna low, the two growth witnesses and a real held-out position,
with three generations per fixture and arm. These were branch-call screens,
not full-game strength comparisons. Adjacent action text, headings separating
accepted modes, removing matchup advice, a separate resource-mode report and
separate alternative ledgers did not yield reliable complete winning
calculations. None is retained. Fetch modes still get mixed, tapped sources
are counted attacking, triggers disappear, and the held-out Zhao entry
restriction gets ignored.

An alternatives table exposed correct Surrak lines that the selected ledger
then discarded. One Hydra answer correctly reached 24. That is a lead, not a
reliable discovery improvement. The experimental schema also contradicted
its prose: it asked for alternatives before the ledger but put that field last.
Every reply followed the schema's field order. Moving the field first, with
identical prose and facts in both arms, scored:

| Correct complete selected lethal ledger | Field last | Field first |
| --- | --- | --- |
| Surrak witness | 0/3 | 1/3 |
| Hydra witness | 0/3 | 0/3 |
| Held-out position | 1/3 | 0/3 |

This mixed screen does not justify retention or a broad confirmation queue.
Growth discovery remains unresolved. The next experiment should carry an
alternative's payment, events and characteristics into its selected ledger
without rewriting them, then check coordinator selection separately. Keep
attack-before-spending coverage and the pilot's schedule miss as distinct
follow-up properties. More prose alone has not solved these failures.

### Matched games and fresh play

Both arms resumed identical version-zero preparations with summaries off.
Control is `f5ad823`; candidate is `b5dec02`. At most two games ran together;
some isolated probes overlapped. Timing observations do not isolate a cause.

| Seed | Arm | Result | Wall time | Strategy wait | Reported cost | Help |
| --- | --- | --- | --- | --- | --- | --- |
| k | Control | Red turn 12 | 8m58s | 6m09s | $0.549 | 1 |
| k | Candidate | Red turn 10 | 7m54s | 5m50s | $0.457 | 2 |
| l | Control | Green turn 13 | 12m26s | 9m31s | $0.711 | 1 |
| l | Candidate | Red turn 14 | 12m26s | 9m39s | $0.725 | 2 |
| q | Fresh candidate | Red turn 12 | 10m30s | 7m36s | $0.627 | 1 |

All five have zero gaps or fallback, matching replay and complete final-state
clones. The matched version-zero tables and preparations also match. Candidate
l needed 30 planning sessions against control's 25; k needed 20 against 23.
One k control branch timed out after 45 seconds and lacked usage. Candidate l
canceled one final preparation without usage; the other three games have
complete usage. There were no judge rulings. Replay parity does not certify
rules legality or playing strength.

Fresh q's preparation is billed separately: 11m22s, 149 Sol high calls and
$1.451. Preparation plus play took 21m52s and reported $2.078. The matched
comparisons reuse preparation and exclude that cost.

Review found specific writer failures with the needed facts present. Candidate
l rejects casting Harmonizer from exile because four green mana supposedly
cannot pay its "colorless generic requirement". The exile permission is
active, and those sources can pay {2}{G}{G}. This disproves the stated rule;
it does not prove casting Harmonizer is better than the chosen Ascension.
In l and fresh q, the writer schedules a newly cast Claw or Zhao to attack
while its own guidance correctly says it is summoning sick. Jev then asks
for help. In l, another plan spends Ba Sing Se on Hydra and then needs to tap
it again for earthbend. These are warranted own-turn repairs. Their exact
prefixes and pending help frames are frozen under `.pi/round4-20261008/new-misses/`.

Candidate k also delivers an explicit Veil-before-blocking policy with legal
payment, but Jev passes and loses the Elf. Its v87 prefix is frozen. Control
loses the Elf under a different policy, so this does not establish a retained
code regression. The next pilot experiment should compare that prose policy
with the existing conditional action representation, checking the actual cast,
payment and combat outcome without another analysis round.

All 191 offline tests, types and saved-prefix checks pass. The new schedule
fixture preserves a known live failure; validating its prefix is not a live
pass. The retained changes are ready for review, with growth discovery,
trigger authoring and broader schedule adherence still open.

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
