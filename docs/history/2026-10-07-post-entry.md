# Combat repair after development

This diagnostic asks whether Luna can reconstruct combat once its own chosen
development is on the battlefield, while revising its inherited losing intent.
The [attack audit](2026-10-07-attack-commitments.md) found that brief A's first
blocked-lethal plan both omitted Challenger and explicitly kept Sanctuary back.
Completeness alone would not make that line win.

## Frozen input

Start from the registered blocked-lethal journal at version 579. Substitute
fresh brief A for Red's carried brief and install A0's exact complete accepted
plan from the blind brief comparison at `429d42b`. This is an explicit change of
experimental advice, not an unchanged continuation of the parent game.
Accepted card terms and all other equipment remain unchanged.

Execute its Mountain, Hired Claw and Emberheart Challenger steps through listed
choices. The payments are supplied from the advisory resource witness, not
payment choices authored by Luna:

- Claw uses the new Mountain `1-31`.
- Challenger uses Mountain `1-32` and nonanimated Sanctuary `1-51`.
- Held Mountains `1-19` and `1-26`, and animated Sanctuary `1-50`, remain untapped.

Opponent passes are supplied no-response assumptions. Stop at Red's first
precombat-main priority after Challenger resolves, with an empty stack. Eleven
recorded physical decisions reach version 590, clock 1011. The journal retains
A0's full plan; ordinary progress marks steps 0, 1 and 2 complete. An ordinary
`plan.request` asks: "Review the unfinished plan from the current position."
The repair base removes those three steps and retains the Kellan-only attack,
declaration finishes, holds, Sanctuary stay policy and scope through turn 15.

The committed fixture is
`test/fixtures/benchmarks/red-post-development.jsonl.gz`. Its source hashes,
supplied development picks and private proof are in
`red-post-development-witness.json` beside it. Full frame replay and clone
parity are checked offline.

## Feasibility and input boundary

An offline supplied continuation verifies a win against Explorer's best single
block, with unchanged accepted characteristics and no responses. Kellan,
Sanctuary and Challenger attack. Sanctuary is a Lizard, so Claw deals one to
Green. Explorer blocks Kellan; Sanctuary and Challenger deal five more. Green
falls from six to zero. Every action is offered by the engine, and ordinary
Plan syntax expresses the attacks and trigger policy.

That proof stays outside model input. The writer receives the unmodified
production repair request: A's brief, the remaining plan, current projected
facts, accepted actions and ordinary tools. It gets no suggested attack set,
candidate list, private outcome or new prompt. The request freeze and input
audit are under `.pi/resume-20261007/post-entry/`. Initial live requests must
match the freeze apart from message timestamps.

## Gate declared before inference

Run three ordinary repairs with `gpt-6-luna:low`, the 4,000 output ceiling and
production's three-reply budget. Complete the batch without replacing failed
sessions. Runner PASS means an accepted plan, not a strategic pass.

Before physical expansion, require all three repairs to contain feasible
winning commitments under the checked visible-response scope, with consistent
delivered conditions, payments, attacks, trigger targets, waiting and completion
policies. Accept any winning line. Grade false audit rationale separately and
do not call a plan wholly coherent when its rationale contradicts its line.
Claw has only one legal trigger target, the opponent; omitting that target
instruction does not fail the gate. Retaining the irrelevant inherited reserve
is a quality error, not a construction failure, unless it conflicts with an
authored payment or action.
An unresolved or losing repair stops physical expansion. No later writer can
supply missing commitments for this gate.

Report accepted and unresolved replies, initial versus repaired commitments,
delivered policy errors, audit errors, first-submission validity, lookups,
latency, tokens and cost. A construction pass only permits bounded execution
checks of those frozen plans, with legality, obedience, repair dependence,
outcomes and replay/clone health kept separate.

This checkpoint changes resources, history and the action catalog as well as
materializing creatures. It also asks the writer to revise inherited intent.
The supplied payments preserve Sanctuary favorably, and only unaffordable Smaug
remains in hand, so the choice space is smaller than at version 579. Any later
end-to-end test must establish authored payment preservation and pilot obedience.
A positive result supports designing an end-to-end serial-construction test
from version 579 without supplied development. It does not justify adding an
automatic combat planner. A negative result rejects this particular repair
protocol on this board, not serial construction generally. Production remains
unchanged and no full-game gate follows.

## Result at `cc67778`

The whole three-repair batch finished. All three submitted accepted plans; two
contain the winning attack set, and one deliberately keeps Kellan back. The
three-of-three construction gate fails, so no physical continuation follows.
The runner's three PASS labels mean acceptance only.

| Repair | Committed attacks | Checked consequence with no responses |
| --- | --- | --- |
| 0 | Kellan, Sanctuary, Challenger, then finish | Explorer blocks Kellan; Claw deals one and the other two deal five. Winning attack set. |
| 1 | Challenger and Sanctuary, then finish; keep Kellan back | Explorer blocks Sanctuary; Claw deals one and Challenger deals two. Green remains at three. Losing attack set. |
| 2 | Challenger, Kellan, Sanctuary, then finish | Same six damage through a Kellan block. Winning attack set. |

Repairs 0 and 2 reverse the inherited Sanctuary stay and add Challenger's
attack. Repair 1 adds both attacks but removes Kellan's attack to preserve it
for defense. Its failure is a selected losing line, not a missing serialization
of an intended Kellan attack. It calls the combat lookup for Kellan versus
Explorer, receives the correct zero-player-damage exchange, and still declares
that no lethal line exists.

These are attack-set results, not evidence of complete execution coverage.
Every repair leaves the current precombat-main window without a completion
policy. Repair 0 sets combat completion to `ask`; repairs 1 and 2 omit it.
No empty policy implies passing. The generated plans have not been piloted,
and no win, waiting obedience or repair-free execution is claimed.

Repair 0's audit guidance falsely says at least ten combat damage gets through
one block. The checked minimum is five plus Claw's one. Its Challenger purpose
also refers to "The Lizard attack"; Sanctuary supplies that Lizard attack in
the committed set. The target instruction is the opponent and the trigger does
occur, so this wording does not establish a conflicting target policy.
Its audit sentence attributing the trigger to Challenger is wrong; that source
claim is separate from the correct delivered combat instructions.
Repair 2 explicitly accounts for Explorer blocking and gives the correct
six-damage calculation. Its "tapped-out, summoning-sick 8/10 Explorer" audit
wording is false whether it means the creature or Green's mana: Explorer and
four Forests are untapped. The same rationale acknowledges Explorer can block.
Both clear the irrelevant reserve. Repair 1 keeps a harmless
Mountain hold and replaces a step labelled "Finish blockers" with a broad
Kellan block selector, leaving no explicit opponent declaration finish.

The diagnostic does not meet its gate. Two successful selections establish
that this writer can reconstruct the attack set on this favorable checkpoint;
the third demonstrates that materializing the creatures and reducing the hand
choices do not ensure it does so. This does not estimate a success rate, isolate
the effect of materialization, or justify a production combat checkpoint.

## Accounting and validation

The three initial requests and settings match the freeze exactly after removing
message timestamps. All use the original ordinary repair prompt and schema.
Two first submissions were accepted. Repair 1 used one lookup, submitted an
invalid literal `block:` action in the wrong window, then corrected it in the
final allowed reply. No session exhausted its budget and no replacement ran.

| Measure | Result |
| --- | ---: |
| Accepted repairs / unresolved | 3 / 0 |
| Model calls / reported usage | 5 / 5 |
| Input tokens, including cached | 133,010 |
| Cached input / uncached input | 78,336 / 54,674 |
| Output / reported reasoning tokens | 3,149 / 0 |
| Summed model time | 65,176 ms |
| Summed whole-session time | 65,254 ms |
| Reported cost | $0.00782526 |
| Failed, cancelled, pending or truncated calls | 0 |

The run is under `.pi/resume-20261007/post-entry/repairs/`; `audit.json` checks
request parity and usage, and `submissions.json` retains all four submissions.
Types, all 179 invariants and all 44 saved-position preflights passed before
the clean experimental commit. Fixture replay/clone and the private supplied
win passed offline. Those checks establish machinery health, not generated
legality, pilot obedience or game outcomes. No default changed.
