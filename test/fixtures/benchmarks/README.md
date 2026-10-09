# Private game benchmark inputs

These compressed journal prefixes preserve the full game knowledge needed for
replay. They are committed regression inputs, not spectator exports. `test/`
is excluded from the published package.

`red-upkeep-lethal.jsonl.gz` freezes decision 270 (physical clock 530), turn 10
upkeep, of `.pi/resume-20261007/scoped-full-game/next-version-gate-20261005-1791339573156.jsonl`.
Red's tactical plan has expired. Three Mountains and Sanctuary are untapped;
two Lightning Strikes can deal six to Green. The parent instead spent all four
sources animating Sanctuary. `good-upkeep-lethal.json` contains three identical
supplied lines using the accepted Strike procedure and the actual hand refs.
They test target, payment, waiting and resolution obedience, not generation.
Planning is due before upkeep choices. `--answers` can separately exercise the
supplied line without asking a writer.

- `oct5.jsonl.gz`: prefix 475 of
  `next-version-gate-20261005-1791250809663`.
- `oct6.jsonl.gz`: prefix 235 of
  `next-version-gate-20261005-1791285458578`.
- `preparations.json`: the three accepted plans from the October 6 component
  review, with their source path updated to the preserved October 5 journal.
- `good-landfall.json` and `bad-landfall.json`: accepted answers with correct and
  incorrect action ordering. Both still have prose problems; the names refer
  only to the original ordering property.
- `after-explorer.jsonl.gz`: prefix 506 of the October 6 continuation
  `next-version-gate-20261005-1791294571883`, ending after the help request and
  before work row 116 accepts its answer. Cutting at that journal line preserves
  the exact pending request within a physical version. `bad-explorer-repair.json`
  keeps the failed benchmark answer, which the game itself had accepted.

Prefixes were copied through `journal.fork`, retaining accepted equipment,
briefs and rollback history. The manifest names individual earlier positions.
Regenerate a fixture from its source journal, never by editing physical facts
or deleting inconvenient records. `npm run benchmark` checks all prefixes
against the pinned cards and rules without inference.

Pilot cases use the loop's receipt boundary: include the seat's last recorded
nonautomatic decision and subsequent events. Strategy facts omit this pilot
slice and retain structured actions and history. This reconstructs the current
context contract, not every historical packet: earlier loops consumed receipt
history on unrecorded looks. Transient refusals must be supplied explicitly.

# Blocked lethal continuation

`blocked-lethal.jsonl.gz` is the prefix of
`.pi/grounded-repair-20261006/continuation-pending/next-version-gate-20261005-1791300535238.jsonl`
immediately before Red's accepted turn-14 amendment at decision 579.
`blocked-lethal-preparation.json` expands the actual preparation submission
(trace call 1) against Red's source frame at decision 506. Its displayed full
plan was checked for exact equality with the consumed base in trace call 71.
`bad-blocked-lethal.json` contains the accepted amendment that sent Kellan
alone into Explorer. These records carry private game knowledge and stay
outside the published package.
`good-blocked-lethal.json` is a manually authored answer checked by core and
then executed through Jev in `known-lethal-play/`; it won on turn 14 with replay
matching. It establishes an executable expected line, not a Luna success.
`partial-blocked-lethal.json` is the third blocked-lethal answer from
`.pi/grounded-repair-20261006/explicit-conclusions/results.json`. It casts and
attacks with Smaug but keeps both other attackers back, missing the win. The
strengthened property rejects that partial commitment while accepting the
executed known answer. It names one verified winning line; other winning lines
still need review rather than being classified as poor play by this check.

`held-vigilance.jsonl.gz` is decision prefix 592 of
`luna-proposal-play/next-version-gate-20261005-1791305906277.jsonl` in the same
private artifact directory. It preserves the actual accepted Luna plan from
the compact-question experiment, after Kellan and Smaug were selected and
before Jev omitted Sanctuary. The plan passed the attack-list property but
missed lethal when played. Its conflicting prose remains in the fixture.

`red-ready-lethal.jsonl.gz` freezes decision 354 of
`scoped-full-game/next-version-gate-20261005-1791339573156.jsonl` under
`.pi/resume-20261007/`, before Red's accepted turn-12 plan. The prefix is cut at
that work row after `journal.fork`. Three established creatures and burn can
win through Green's lone Hydra; the recorded line omitted Sanctuary. The
manifest grades a physically observed win rather than one specific attack set.

`green-block-preparation.jsonl.gz` freezes prefix292 of
`consequence-upkeep/red-upkeep-lethal-2-receipt-consequence/game.jsonl` under
`.pi/resume-20261007/`. Call30 first generated the broad Kellan block there.
`green-multi-attack.jsonl.gz` is prefix293 of treatment run1 in the same family,
before Green selects a block against Kellan, Zhao and Smaug. It supports a supplied
matching test, not a claim about the instruction accepted after that declaration.
`block-kellan-zhao.jsonl.gz` and `block-zhao-only.jsonl.gz` descend from the first
prefix through recorded passes and supplied T12 attacks. No physical fact was
edited. The pair-catalog experiment was not adopted.

## Dossier review positions

- `kellan-reserve.jsonl.gz` is decision 82 of
  `claude-20261007-i-1791416748215`: Red is at begin combat with a postcombat
  Zhao cast in its plan. The original plan lacks a hold covering that payment.
  The pass expectation tests preservation of the line; it does not establish
  that the original policy gave Jev sufficient instructions.
- `smaug-zero-target.jsonl.gz` is decision 244 of
  `claude-20261007-j-1791416748242`: Red chooses Smaug's attack-trigger target
  with zero Treasures. Its accepted phase policy names Green. Targeting a
  creature instead gives Green a Surrak draw without dealing damage.
- `green-harmonizer-lethal.jsonl.gz` is decision 182 of the same j game, with
  a journaled request to review the unfinished line. The physical position is
  unchanged: turn 7 draw, Red at 16, Surrak and Llanowar Elves untapped, four
  usable sources, Harmonizer and Escape Tunnel in Green's hand.

`good-harmonizer-lethal.json` is a manually prepared witness, not a strategist
answer. Cast Harmonizer with the four existing sources, play Tunnel, resolve
its landfall on Surrak, sacrifice Tunnel for a basic Forest, resolve the second
landfall on Surrak, then attack with Surrak. The Elf pays for Harmonizer and
cannot also attack. Ordinary Jev seats executed this line and won on turn 7,
with matching replay and clone checks, no gaps and no fallback. This proves
one observed continuation, not a win against every response.

Run the strategist with `npm run benchmark -- --live --case
green-harmonizer-lethal --play --through 7`. Add `--answers
test/fixtures/benchmarks/good-harmonizer-lethal.json` to test execution of the
supplied line instead. Both spend on live inference. Without `--play`, an
accepted plan does not establish the outcome property. The case also checks
the initial accepted sequence before any pilot moves or repairs: Harmonizer
before two land entries and the Surrak attack. A matching sequence does not
certify its targets, payment instructions or arithmetic.

`stale-response.jsonl.gz` ends at decision 438 of
`engine-feedback-20261008-l-1791451374149`, immediately after Green's
declare-blockers help request and before the failed repair is kept. Ba Sing Se
left and returned, but an unfinished own-turn attack still names `0-1@2`.
The current-window editor could not remove that inherited step, while full-plan
validation refused every response containing it. This is an interface failure,
independent of the choice of blocks. The repair must let the writer explicitly
remove or replace the stale commitment without rebinding the land automatically.
Use `--live --case stale-response --play --through 14` to check the repair and
the remainder of the turn. The original failed run stays in the October 8
evidence directory.

## Target and growth review

`smaug-player-policy.json` supplies the existing Smaug position with an explicit
player target: Green (seat 0). It appends phase coverage through `pilotPolicy`;
the original options and physical facts stay. In three repeats the original
policy picked Explorer each time, while this supplied wording picked the player
each time. The `smaug-explicit-player` case tests execution, not plan generation.

`final-k-smaug-player.jsonl.gz` ends at decision 224, physical clock 435, of
`engine-feedback-20261008-k-1791479095957`. It includes the accepted help answer
before Jev chooses Smaug's zero-damage target. The phase policy names Green
(seat 0) and forbids targeting an opposing creature for zero. Jev nevertheless
picked Explorer. This is a delivered-policy case with no Surrak on the board,
so the wrong target caused no observed card draw. The pilot case checks the
target id, not strategy authoring or a game outcome.

`hydra-postcombat-response` reuses the earlier decision 119 of the Smaug journal.
Green has a fetch on the stack in postcombat main and a 1/1 Hydra; Red holds
Shock and Burst with an unrestricted red source. The original plan has no
policy for that window. Its failed removal expectation diagnoses missing
coverage, not disobedience of an instruction to remove Hydra. Earlier precombat
work explicitly told Jev to pass and wait for growth; these are different cases.

`green-hydra-growth.jsonl.gz` freezes decision 180 of
`claude-20261007-i-1791416748215`, including the neutral review request used by
the October 8 comparison. Green has a 2/2 Hydra with two counters, three usable
green sources, Harmonizer and Tunnel in hand. Red is at 20 with no creature
blocker. `good-hydra-growth.json` supplies an executed turn-7 win:

1. Warp Harmonizer for {2}{G} using the three existing sources.
2. Play Tunnel. Put Harmonizer's trigger on the stack first and Hydra's last,
   so Hydra's counters become four before Harmonizer doubles its power to eight.
3. Sacrifice Tunnel for a tapped Forest. Use the same trigger order. Hydra now
   has eight counters plus the earlier four-power increase, for 12 power.
   Harmonizer doubles that to 24.
4. Attack with Hydra after both sets of triggers resolve.

Ordinary Jev seats executed this witness in 43 further decisions, won on turn 7
and produced matching replay and clone checks with no gaps or fallback.
It verifies one observed line, not discovery or every opposing response.
The case checks the initial accepted choice: warp Harmonizer before Tunnel
enters, fetch with Tunnel, then attack with Hydra. A later repair cannot satisfy
that initial-plan check. Trigger targets, payment and power arithmetic still
need review. Without `--answers`, the case asks the writer to find its own line:

```sh
npm run benchmark -- --live --case green-hydra-growth --play --through 7
npm run benchmark -- --live --case green-hydra-growth --play --through 7 --answers test/fixtures/benchmarks/good-hydra-growth.json
```

## Pilot schedule review

`p-future-step.jsonl.gz` freezes decision 359, physical clock 729, of
`claude-20261008-p-1791503205155`, before later work at that decision.
The window is draw; the accepted Burst Lightning step is scheduled for
precombat main. The schedule and "not taken now" instruction survive the
use, target and payment inspections, but Jev casts Burst during draw in all
three held-out repeats under both arms. `pilot-future-step` expects a pass
to the scheduled window. It measures obedience to that plan, not whether
casting the instant earlier is legal or strategically worse. The prefix
and carried brief match the original position before later work.

## Oversized damage assignment

`n-trample-assignment.jsonl.gz` freezes `claude-20261008-n-1791540958433`, played
on October 9, at its last pending decision (480): an earthbent Forest with 212
power and trample, blocked by Hired Claw, with Red at 2 life. The table lists all
211 splits. That request overran Jev's window (`max_tokens_exceeded`) and the
game stopped. `pilot-trample-assignment` passes when the seat narrows the
decision by inspection and picks a split that deals Red at least 2.

## Strategy misses from October 9 games

Each prefix ends just before the writer's own `plan.put` at that position, so a
case asks the writer again from the same facts. Properties are written from
review of the board, not computed.

- `k-missed-lethal`: game k turn 9 draw step (v239), with Harmonizer just drawn.
  Hired Claw and Smaug are tapped through Green's turn. Harmonizer first, then two
  fetch-land plays each sacrificed for a basic, doubles Explorer four times. The
  writer said "Smaug can block it". (An earlier cut at v236 was before the draw,
  where no lethal existed.)
- `m-explorer-first`: game m turn 9 draw (v299). Explorer from hand opens the two
  graveyard Passages; the writer said they could not be played yet.
- `n-attacker-tapped`: game n turn 11 after a help request (v412). The writer paid
  for the exiled Harmonizer with the Forest it attacked with.
- `m-red-blockers`: game m Red turn 6 draw (v178). The writer said creatures cast
  this turn cannot block on the opponent's turn.

Codex's five October 8 misses (`l-generic-payment`, `l-sick-claw-repair`,
`q-sick-zhao-repair`, `l-source-reuse-repair`, `k-veil-before-blocks`) moved here
from ignored `.pi/round4-20261008/new-misses/` unchanged.
