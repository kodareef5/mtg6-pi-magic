# Grounded repairs, October 6

The continuation goal is consistent full-game quality through saved-position
tests, play, review and tested commits. The earlier version goal remains
complete. The testing roster is unchanged: Jev executes; Luna low plans and
judges; Sol 6.1 high prepares. No stronger runtime model is used.

## Controlled questions

Each arm runs the landfall amendment, established Zhao amendment and
after-Explorer repair three times. Inputs are the committed journal prefixes
and accepted preparations. The unchanged baseline is `cf94a5c`. Outputs,
source patches and full traces are under `.pi/grounded-repair-20261006/`.
Some processes overlapped, so elapsed time is descriptive, not a controlled
latency result. These are small exploratory samples.

| Arm | Accepted | Action structure | Structure and wording check | Calls | Whole decisions |
|---|---:|---:|---:|---:|---:|
| Baseline | 9/9 | 1/9 | 0/9 | 14 | 259.1 s |
| Current source bindings | 9/9 | 4/9 | 4/9 | 13 | 205.0 s |
| Separate repair question, retired general prose | 8/9 | 4/9 | 3/9 | 14 | 211.0 s |
| Original question with current-position sheet | 9/9 | 8/9 | 7/9 | 14 | 325.1 s |
| Sheet with only the inherited action sequence | 7/9 | 5/9 | 5/9 | 20 | 235.0 s |

The binding arm adds current types, tap state and sickness beside movement
selectors, and evaluates each inherited hold's own release condition. Resource
context includes currently permitted visible graveyard and exile lands. These
facts do not reject a future transformation or choose a plan for the seat.

The separate repair question keeps ordered actions, branches and holds, but
retires general and phase prose behind a lookup. It does not improve the
bindings arm and is withdrawn. A further sequence-only arm adds the current
sheet and retires branches, holds and stops too; it generates extra refusals
and is also withdrawn. Neither alternate base lifecycle is the default.

The retained sheet names the complete current creature rosters and own hand,
available mana sources and current land permissions. It uses projected facts
and the same labelled forecast as the rest of a preparation question. Full
card text and restrictions stay available in the ordinary question. No text is
clipped, no card-name rejection is introduced, and no model generates this
factual sheet.

## What the score misses

An action pass is not a coherent turn. The binding arm still described an
imaginary creature-land in a passing repair. The sheet reduced this mistake,
but passing answers still confused available payments, retained absent Veil
advice, or wrote an Explorer attack while correctly saying it was sick. One
landfall answer proposed paying with Vein while also acknowledging that Vein
was gone. The saved repair property forbids the old Forest attack; it does not
yet forbid every unsupported new attack or validate all prose.

The pregame response policy is another source of copied assumptions. Its
worked examples have Veil in hand; its reserve advice is often worded as a
default. Removing an old resource hold alone does not bind that advice to the
current hand. Future response commitments need actual source and window
bindings, rather than another instruction to recount the board.

## Continuation and next saved decision

The pending repair prefix at decision 506 continued through turn 14 and stopped
at turn 15. Green played a graveyard Passage and fetched Forest. Those land
entries grew Explorer from 4/6 to 8/10; no nonexistent land creature attacked.
The plan still incorrectly declined an affordable Hydra and requested one more
land play than remained. The table offered no extra land play.

Red's amendment then ordered Kellan to attack alone. Explorer blocked; double
strike dealt it six damage, and its eight damage killed Kellan. Red had Smaug
in hand and enough mana to cast it before combat. Smaug's flying and haste,
with the other available attackers and a payment preserving them, provides a
lethal line through the single ground blocker. The accepted plan instead
developed smaller creatures after combat.

`red-blocked-lethal` is the seventeenth saved case. Its journal ends just before
the failed amendment. The preparation is reconstructed from the recorded
submission and verified against the actual amendment request's full base.
The narrow check requires casting Smaug before attacking with it. The payment
and remaining attackers still need review; that check alone does not prove a
winning line. This is the next combat-arithmetic question to refine.

The continuation took 116.4 seconds overall, 112.8 seconds of play and 63.8
seconds waiting for strategy. It made 101 Jev calls and seven strategy calls,
two cancelled on stopping. Reported cost was $0.0401, covering supplied usage;
the two cancellations supplied none. Replay matched, with no gaps or fallback.
Its consumed preparation was ready, with no unfinished-preparation wait or
timeouts. The report and timeline are in `continuation-pending/`.
An earlier continuation under `continuation/` copied the already accepted old
repair; it was stopped and is excluded from this validation. Its trace remains.

Twelve broader probes cover the other three preparation cases and the funding
land amendment: 11/12 accepted and 8/12 passing action structure. They remain a
small quality sample; the full traces and answers
are in `broader/`. The repeated refusals also reproduce `when.step: "combat"`
and `"any"`, plus bounds nested inside `amount`. The strategy submission tool
now accepts those unambiguous forms and stores canonical windows and bounds.
Conflicting phase claims and duplicate bounds remain errors. This uses the
existing bound reader, which had no production caller, rather than another
prompt warning. Offline tests cover normalization without mutating the answer.

Types and all 179 offline tests pass. Full games remain gated on coherent
combat and resource decisions, not on completing this partial continuation.

## Combat arithmetic and the known winning line

The unchanged planner missed the saved Smaug line in three of three probes.
Automatically adding current single-block exchanges also missed it in three
of three. The extra attachment is withdrawn. Some answers acknowledged that
Explorer kills Kellan and still ordered that attack; another repeated the false
claim that a sick creature cannot block. Correct facts alone do not repair the
large question's reliance on inherited intent.

The shared calculation remains useful independently of that failed attachment.
Physical block options and the named `combat` lookup now use the same damage
reader, including first strike, double strike, marked damage, deathtouch,
indestructible and minimum lethal trample assignment. It reports keyword
conflicts separately and does not select attacks or blocks. Tests execute the
real combat after the prediction and compare destruction and player damage.
A blocker killed in first-strike damage deals no later damage, and a blocked
double striker reaches the player only with trample. Marked lethal damage on
an indestructible blocker requires no extra assignment even with deathtouch.
Responses, triggers, replacements and life gain remain outside the forecast.
The arithmetic probe also exposed that the current damage path does not apply
lifelink automatically; that broader mechanic remains open.

`good-blocked-lethal.json` records a manually authored, checked answer. It plays
Mountain, casts Smaug while holding the animated Sanctuary untapped, releases
that hold when Smaug enters, and attacks with all three creatures. This is a
known-answer benchmark, not a successful Luna planning sample.

Jev executed that answer in the real seat loop. Green's Luna response chose the
best single block, Explorer on Kellan. Smaug and Sanctuary dealt seven through
it, and Red won on turn 14. Replay matched with no gaps or fallback. The focused
execution took 20.0 seconds overall, 17.5 seconds of play, 29 Jev calls and one
completed response-planning call. Two background preparations were cancelled;
reported cost was $0.0116, with their usage unknown. The evidence and timeline
are in `known-lethal-play/`.

This separates a planning failure from an execution failure. The engine and
pilot can execute the line; the organizer still fails to choose it. The next
context comparison should ask for current tactical decisions with prior
reasoning accessible separately, before another full-game gate.

## Further question comparisons

Two more arms each ran the same four own-turn decisions three times, adding
the blocked-lethal case to the earlier three. Both are withdrawn. The explicit
conclusions arm required finish, danger and commitment fields in the same
submission and used them as general guidance. The advice-lookup arm retired
inherited general and phase prose, preserving structured commitments, and made
the full playbook and previous plan available through a named lookup. Neither
changed the roster or clipped any text.

| Arm | Accepted | Action structure | Structure and wording | Calls | Whole decisions |
|---|---:|---:|---:|---:|---:|
| Explicit conclusions | 12/12 | 7/12 | 6/12 | 18 | 343.5 s |
| Prior advice through lookup | 12/12 | 8/12 | 7/12 | 32 | 369.4 s |

Both missed beneficiary-before-land in all three repetitions. In the blocked
case, one explicit-conclusions answer and two advice-lookup answers passed the
narrow Smaug-before-attack property. None included enough attackers to execute
the known winning line. The apparent passes do not establish tactical quality.
The conclusions still invented trample on Explorer, confused life totals or
payments, and declined wins for unnecessary defense. The lookup variant spent
more calls retrieving prior advice without making that advice reliable.
The patches and complete traces remain under `explicit-conclusions/` and
`advice-lookup/` in this round's private artifact directory.

A separate diagnostic asked Luna low for plain-language tactics, without plan
syntax, old intent or the brief. With the remaining detailed projected facts,
three replies still missed the win. A hand-written simplified combat position
made all three replies find a lethal cast-and-attack idea, but each claimed it
could tap the creature-land for mana and also attack with it. This diagnostic
was not an executable plan or a complete gameplay context: it omitted other
permanents, ongoing registrations and Sanctuary's all-creature-types detail.
It only indicates that clearer presentation helps recognize an opportunity;
resource and combat facts must still bind the actual sequence. Both diagnostic
scripts, prompts, replies and usage are preserved beside the comparison arms.

Review also found a deterministic inconsistency: `budget` reserved every hold,
even when its release condition was already true. `planState` correctly released
it during execution. The forecast now evaluates that same condition against its
observed or labelled untap position before reserving the source. It does not
predict a future release caused by a resolving effect. The existing arithmetic
test covers a response still in hand, its departure, agreement with execution,
and an unchanged input frame. Types and all 179 offline tests pass.

The blocked-lethal property now requires Kellan and Sanctuary attacks as well
as Smaug's cast before its attack. A durable partial answer preserves the case
that previously passed while still missing lethal. The executed known answer
passes and that partial answer fails. This remains a check for the verified
line, not a general combat solver; payments, conditions and alternative wins
still require review. The unchanged test count is 179, all passing with types.

## Card definitions beside the hand

The context now separates off-field base characteristics from installed
battlefield abilities. An empty keyword array on a card in hand came from the
core's uninstalled registrations; it did not mean that its printed flying or
haste was absent. The hand roster now carries the complete printed definition,
and the other visible definitions remain in the card index. Battlefield traits,
explicit off-field terms and unresolved stack instructions remain intact. Life
totals are also labelled by our seat and the opposing seats. No Oracle prose is
parsed and no resolution is simulated.

A fresh paired comparison used the four own-turn cases three times each, under
the stronger attack property. The unchanged `8a32785` planner accepted 12/12,
passed 6/12 structural checks and 4/12 combined checks, with 14 calls in 255.4
seconds of whole-decision time. The revised representation accepted 11/12,
passed 6/12 structural checks and 5/12 combined checks, with 15 attempts in
361.1 seconds. One attempt timed out at 45 seconds with no reported usage.
Both missed the complete winning attack. These overlapping small samples show
no established strength or speed gain. The representation is retained because
it states the supplied card facts accurately, not because a wording score rose.
The paired traces are `card-definitions-baseline/` and `card-definitions/`.
Types and all 179 offline tests pass, including full visible-definition coverage,
private-hand projection, unresolved effects and current battlefield abilities.
