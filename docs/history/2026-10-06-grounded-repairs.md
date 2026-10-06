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
land amendment. They remain a small quality sample; the full traces and answers
are in `broader/`. The repeated refusals also reproduce `when.step: "combat"`
and `"any"`, plus bounds nested inside `amount`. The strategy submission tool
now accepts those unambiguous forms and stores canonical windows and bounds.
Conflicting phase claims and duplicate bounds remain errors. This uses the
existing bound reader, which had no production caller, rather than another
prompt warning. Offline tests cover normalization without mutating the answer.

Types and all 179 offline tests pass. Full games remain gated on coherent
combat and resource decisions, not on completing this partial continuation.
