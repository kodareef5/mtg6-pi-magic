# Repair authority audit

At `3fe9e10`, an offline audit rejected switching own-turn help directly to the
existing response writer. That format preserves future steps but still permits
replacing every phase policy. It accepts both observed false combat policies,
while preventing a direct revision of future attacks after a changed blocker.
No production change or inference experiment follows from this audit.

This is a representability result. It does not establish that repair scope is
irrelevant, or that a different repair contract could not improve the writer.
The two recorded continuations both retained winning attackers and won. Their
false delivered guidance is a coherence defect, not demonstrated outcome harm.

## Sources and reconstruction

The two sources are the `production-0` and `completion-2` continuations in
`.pi/resume-20261007/completion/play/`, from the
[completion comparison](2026-10-07-completion-coverage.md). Each has an installed
Red plan at work sequence 119, a help request at sequence 120, and its accepted
repair at sequence 121. Both repairs are writer request 5.

The audit cuts each raw journal immediately before sequence 121, retaining the
help request and original plan. A version-only clone could include the repair:
both work entries share ledger length 592 and clock 1016. Replaying each exact
prefix and calling `planWork` with an offline double reproduces the complete
saved system, messages and tool schemas, excluding message timestamps. Applying
the saved submission through its current check produces the exact recorded
accepted plan. Neither replay nor the double calls a model.

Between installation at clock 1011 and help at 1016, Red and Green each pass
once. The turn moves from precombat main to beginning of combat. Projected
objects, players and mana pools are equal. The stack is empty. No blocker,
payment, creature characteristic or damage change requires revising the future
attack set. Each request still has three ready attackers, Green at six, and
Explorer as Green's sole blocker.

Private artifacts under `.pi/resume-20261007/repair-authority/` include
`audit.mjs`, exact journal cuts, rebuilt requests, before/after plans, supplied
response witnesses, and `audit.json` with source hashes and field differences.
The source journal SHA-256 values are:

- `production-0`: `9a8718f307515a0218b2619d81a47934b27c1456571c06383313e92139456efe`
- `completion-2`: `3002d067fa4461a2f16b818c1f4410391e9eaca09066d1ff768bc12bd2a47755`

## What each recorded repair changed

| Source | Local choice | Edits beyond that choice | Consequence |
|---|---|---|---|
| `production-0` | Pass to declare attackers; its broad combat completion remains `ask` | Rewrites all three attack purposes, audit fields and every phase's prose; retains actions, windows, finish steps and holds | Corrects the trigger source in delivered fields, but promotes the false "at least 10 combat damage connects" claim into combat guidance; its audit objective still names Challenger as the trigger source |
| `completion-2` | Adds an explicit begin-combat pass policy | Rewrites three attack purposes and phase policies, removes the future finish-blockers step, adds a defensive stop and changes opponent declare-attackers completion to `ask` | Retains the winning attacks, but adds the false delivered claim that Claw has no trigger because no Lizard attacks |

The three attackers are Kellan, Sanctuary and Challenger. Explorer blocking
Kellan leaves five combat damage plus Claw's one. Sanctuary's current creature
types include Lizard. Both facts were available before and after help. The
first repair improves some source wording while introducing a delivered damage
error; the second introduces a trigger error. Those are model-authored changes,
not consequences of a new board state.

Neither repair adds a current pass step. In `production-0`, even the broad
`ask` completion stays. Both pilots subsequently pass. These records therefore
show successful continuations after broad rewrites, not proof that the rewrites
were necessary for passing. The older damaging repairs remain separate evidence
of repair risk in [payments and execution](2026-10-07-payments-and-execution.md#physical-execution-control);
this audit does not reclassify them or assume today's code prevents them.

## What the existing response format can express

`ResponseSchema` requires current-window actions and optionally permits guidance,
phases and holds. `responseChanges` supplies the exact current turn and step,
replaces matching steps, and preserves every nonmatching step. Phases still
replace the whole list. It has no operation to revise a later step.

Three supplied witnesses pass schema expansion, plan checks and resource checks
on each saved frame:

1. A current pass retains every future step and every phase unchanged. This
   proves the local action can be expressed; it does not measure Jev's obedience
   or solve later windows with retained `ask` completion.
2. An author can split the broad combat phase into a begin-combat pass policy
   and exact later combat steps carrying the original guidance and completion.
   Matching later windows receive identical policy content. No automatic
   precedence or code-selected policy is needed, but the author still replaces
   the full phase list.
3. A current pass plus the recorded repaired phase list also passes. Thus the
   narrow format accepts the same false delivered combat guidance while keeping
   the original attack commitments. Narrowing the response predicate alone
   does not close this authoring channel.

## Changed-blocker boundary

The existing preparation invariant adds a blocker and checks that an upkeep
amendment runs. Its prepared plan has no attack steps; it does not establish
authority to revise future attacks. This audit adds a supplied representation
witness, not a newly observed game or model response.

On a copy of the `production-0` repair frame, the fixture places registered
Mossborn Hydra `0-47@1` onto Green's battlefield with its accepted entry terms.
It is an untapped 1/1. Every other battlefield object is unchanged. Explorer can
now block Kellan while Hydra blocks Sanctuary, leaving Challenger's two plus
Claw's one. The previously winning attack set needs reconsideration.

For the representation check, the supplied author chooses to withdraw the future
Sanctuary attack. That choice is not certified as the best new strategy. The
ordinary changes format can remove it. The response format rejects a `steps`
field and retains it after a current pass. Revising phase prose cannot remove
that structural commitment. The ordinary deletion witness still carries prose
ordering all three attacks: it proves structural edit authority, not a coherent
completed repair. A later repair in declare-attackers could replace
it, but that is another session, not a direct repair of the affected line now.

## Decision

The simple timing repair is expressible, including an explicit phase split.
The existing response format nevertheless has the wrong boundary for the proposed
predicate-only change: it preserves future actions even when an author wants to
revise them, while leaving future prose open to replacement. Reject that change;
do not launch a live arm on the strength of these witnesses.

No inference ran and no physical continuation was added. The next offline task
is the bounded delivery audit of the last scoped full game: distinguish known
failures whose inputs or validation have changed from unchanged model choices
and unresolved source defects. Changed delivery alone will not count as evidence
that a seat would now choose differently.
