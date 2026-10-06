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
| Original question with current-position sheet | 9/9 | 8/9 | 7/9 | 14 | 322.5 s |

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

Both retained builders passed types and all 179 offline tests. The broader
planning cases and a physical continuation are the next validation step.
