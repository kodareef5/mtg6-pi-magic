# Plans

## Next version: shared mechanics and prepared strategy

Approved October 5 and delivered through the reviewed gate. This document
records the contract, completed work and the next review cycle. The previous design,
worked question sequences and implementation notes remain in
[the October 5 archive](history/2026-10-05-plans.md).

The engine executes shared Magic mechanics and maintains visibility, resources,
identity, timing and replay. Models interpret card meaning into those mechanics.
Complete executable programs for every registered card are no longer a setup
requirement. Existing procedures and registrations remain useful; replacing them
with another representation needs a concrete simplification.

Pregame prepares the matchup's policies and worked lines. Luna low chooses and
binds the applicable policies to the position, orders the actions, reserves
resources and names exceptions. Jev navigates the interface under that direction,
including voluntary actions, responses and priority passes. Many Jev calls are
acceptable. Redundant questions and strategic work handed to Jev are defects.

## Boundaries

- Keep Jev for decide, Sol 6.1 high for pregame, and Luna low for strategy,
  judge and summary. Preserve a run's summary setting when comparing it.
- Core never infers Oracle meaning from strings. Model-authored claims name the
  relevant source text; acceptance checks syntax and provenance, not correctness.
- Card understanding and executable completeness are separate. An unprepared
  ability is an outstanding interpretation task, never evidence of no ability.
- Prepare standing restrictions, replacements, keywords and event watches before
  an affected action or event. Entry alone is too late for some abilities.
- Prepare a particular spell or activated use when it is needed. Reuse accepted
  instructions when their source text and interpreter contract still match.
- Arithmetic, payments, identity, event ordering and scheduled effects use shared
  mechanics. Do not add a math model or per-card engine handlers.
- Freeze accepted instructions with the action. Replay and clones preserve the
  accepted interpretation; they do not ask a model or silently upgrade meaning.
- Jev can identify a mismatch and ask for a revised line. A judge handles a
  suspected rules violation. Neither mechanism invents a physical action.
- Preserve all original moves through inspection. Provider limits require a
  complete decision structure, never truncation, first-N menus or a forced pass.
- Keep delegated continuations separate from chosen and forced operations. Do
  not restore blanket delegation to reduce a call count.

## Preferred uses to establish first

| Situation | What must be prepared | What Jev answers | What core executes |
|---|---|---|---|
| Nova Hellkite entering and attacking | Flying and haste; its entry watch; chosen casting mode | Cast, target and attack choices under the line | Payment, entry, watches and combat restrictions |
| Rockface Village funding a turn | Spending restriction; source reservation and release condition | Which listed payment follows the reservation | Exact mana and permitted spending |
| Chocobo followed by a land | Beneficiary-first sequence; target policy and expected trigger | Next action, then the trigger's prepared choice | Entry events, trigger order and counters |
| An event subject to replacement | Applicable replacement before the event | Any choice the replacement requires | The replaced event and resulting state checks |
| Warp and a later end step | Source references, timing, lifetime and continuation | The prepared delayed instruction's choices | Schedule, zone identity and later play permission |
| An unexpected draw or opposing action | Applicable draw class or response; explicit exception | Follow a covered branch or ask for help | Preserve the current decision while planning changes |
| Blockers, damage or a large search | Complete structured alternatives and the plan's purpose | Inspect and choose within actual API capacity | Only the final original move |

The existing question examples are regression evidence. Update them around this
contract before changing the writer prompts. An empty option list has distinct
causes: a false condition, a later window, a resolving prerequisite, missing
interpretation, or an impossible required step. Those must not collapse to skip.

The pilot's action question carries a derived checklist. With a land step
available and a creature step later, it asks for the land directly. With a spell
on the stack, it shows the land as waiting and asks for a response or pass. With
a false branch condition, it shows that fact without asking whether it is false
again. Ending an empty-stack window explicitly confirms the supplied completion
conditions in the same physical choice. An unavailable required line needs help;
no status marks it completed. Unmentioned cards remain inspectable options,
without separate invitations for Jev to invent a strategy for each one.

A commitment can explicitly require `waitFor: "empty-stack"`. While any object
remains on the stack, its checklist, script and marks show waiting and keep
later steps later. Every physical option stays available and a chosen action
still records execution. An omitted prerequisite preserves announcement order,
so a second response can go above the first. Waiting grants no pass.

Finishing an attacker declaration names the available ordered attack steps it
would leave unfinished. Their choices remain offered, including finishing;
optional branches create no obligation.

Pending attack and block selections can be withdrawn before finishing. Their
original ledger rows remain, but withdrawn rows supply neither completed steps
nor worked actions. A new selection can earn new credit. Withdrawing across an
amendment does not restore a deleted step; a later declaration cannot cancel
earlier finalized work. Withdrawal IDs do not match `attack:` or `block:`.

Tactical work expires after its selected own turn and the following opponent
turn. Fresh preparation starts from the pregame playbook, accepted equipment
and current facts. Repairs preserve the scope and unfinished commitments; no
old windows are re-dated. A seat with prior scoped tactical work accepts its
next plan after untap, before upkeep choices or compulsory trigger announcements.
The existing background job is awaited and checked against the actual position;
without a surviving job, the same planner writes from current facts. Opening
and unscoped legacy work retain the post-draw deadline. A separate review after
the actual draw preserves the valid scope, holds, policies and unfinished steps,
using the resources left by upkeep and the recorded cards drawn. Prior scoped
response work also establishes early acceptance on a seat's first own turn.
A wholly skipped draw introduces no second review after upkeep acceptance. With
no acceptance yet, planning is still due at the first later policy decision.
The recorded rules-draw action creates a review deadline even if a replacement
changes what arrives; compulsory drawing and single-option state checks run
before scheduled planning.
No new journal event or stored progress flag is needed. A kept or failed plan
acknowledges the deadline once without supplying missing policy or permission
to pass. Prepared reuse still requires positive coverage for changed facts.
Context renders each step's execution choices before
announcement and throughout inspection. Resolution recovers the announcing
plan's step and phase policy, including triggers. General objective and guidance
remain audit rationale. Completion is explicit per window; missing instructions
grant no pass. [Question sequences](history/2026-10-07-execution-examples.md).

## Commit sequence and acceptance

1. [x] Record the approved contract and preserve the previous experiments.
   Separate current decisions from historical run logs. Identify which current
   requirements this version replaces; do not claim the migration is complete.
2. [x] Make inspection reversible and provider-sized for every decision kind.
   Re-entering a use must work. Damage, blocks, search, targets and payments must
   remain reachable without an oversized request. Test real saved positions and
   compare the reachable leaves with the original offered ids. No table changes
   occur during inspection and no navigation limit chooses an action for a seat.
   Verified against the stopped turn: all 1,040 assignments are reachable through
   51 inspection menus, each with at most 50 choices. Compound actions expose
   named components; a large single domain uses inclusive ranges. Target and
   payment stages carry their own facts instead of every combination at once.
3. [x] Simplify card meaning around shared mechanics and explicit readiness.
   Start with the uses above. Add canonical vocabulary where it removes repeated
   expressions. Separate standing terms from deferred uses and remove mandatory
   whole-card compilation from setup. Missing relevant meaning requests work
   before the affected operation; it cannot silently drop an ability or an option.
   Preserve old accepted journal terms. Test hand, battlefield, exile and graveyard
   uses, source coverage, delayed effects, control changes and clone parity.
   `printedCast` selects the shared ordinary permanent cast. Standing terms and
   a source-backed inventory precede dealing; `deferred` uses need bodies when a
   visible source enters their accepted scope. A separate strategy-role call
   interprets them before a priority action or pass. This conservative gate does
   not yet test affordability or timing. Old complete assessments remain usable.
4. [x] Refocus Jev on executing prepared instructions.
   Replace duplicate review-then-pick questions with a direct execution question
   when the plan and facts settle the purpose. Keep necessary completion and
   exception checks. Distinguish waiting from a broken line. Remove strategic
   reassessment of each otherwise unmentioned card as a routine obligation.
   The action question now carries derived checklist status and completion
   conditions. Card/response review jobs and the automatic review-then-pick
   loop are removed. All voluntary actions and passes still reach Jev.
5. [x] Make pregame a reusable playbook and Luna its turn organizer.
   File policies by opening, sequencing, resources, responses, combat and recovery,
   with applicability, priorities, worked examples and reversing conditions.
   Supply relevant policies and changed facts to each turn session. Ordinary turn
   plans select known actions and choices; they should not rewrite card meaning.
   Remove pinned-matchup names from shared instructions. Reject missing bindings
   clearly. Measure accepted plans, repairs and waiting with Luna low unchanged.
   `docs/PLAYBOOK.md` defines the preferred examples. Fresh briefs now require
   all five turn-policy families with ordered priorities, resources and worked
   examples. Carried briefs retain their original shape. Turn context selects
   strategic fields and visible card notes; repeated offer terms are factored.
   Source/condition bindings and unknown reuse keys still receive explicit
   refusals. The live gate must measure whether these changes improve planning.
   The first component run exposed duplicate work across the analyst questions.
   Each family now has one analyst, and synthesis can carry draft policies
   unchanged instead of rewriting them. This changes the question structure;
   it does not trim returned text or change model effort.
6. [x] Close verified integrity gaps and reconcile the interface.
   Reproduce the missing alternate-zone cast, weak source checks, rollback id
   collision and delayed-trigger look-back report. Fix each supported reproduction
   in its invariant test. Make delegation documentation match executable handlers.
   Keep visualization assets outside decision context and simplify display hooks.
   Bounded replay and clones now retain the ruling history behind an included
   rollback. Departure events read delayed triggers from the prior world, so a
   source-tied watch sees its own departure and then expires. Both reproduced
   failures have invariant coverage, including a clone's subsequent rollback.
   Source checks require complete sentences or printed lines, including short
   keyword lines, and preserve the order of joined quotations. Cost symbols
   and arbitrary word fragments no longer pass. The worked examples use the
   same check; accepted meaning remains a separate judgment.
   An older empty printed-cost procedure no longer suppresses the shared cast
   in an earned graveyard or exile permission. Alternative costs, special
   instructions, conditions and an explicit withdrawal remain distinct. All
   four previous games still replay to their original outcome or stopping point.
   Reports and timeline rendering now live in `tools/`. Loop observers use
   named options. The unused `Decision.delegated` flag is removed; documentation
   identifies the explicit intent permission that core actually honors.
7. [x] Validate the complete path, then run one live gate.
   Run offline invariants, focused model-contract exercises and replay/clone checks
   before paid full games. Use registered decks and ordinary setup. Review the
   gate's exact requests, strategic decisions, legality and timeline. A finished
   game alone is insufficient. Stop a failing gate at its first diagnostic gap.
   The gate finished on turn 16 with no recorded gaps or fallback and matched
   replay. It took 15m14s of play with carried preparation, 675 Jev calls and
   67 strategy calls. Strategy wait was 12m07s; playing strength and the fivefold
   speed target remain unmet. Review found missing pending-action windows in
   Jev's packet. The corrected packet passed the exact saved draw-step check:
   Jev waited for the planned cast instead of spending its mana elsewhere.
   Types and all 179 offline tests pass. The full evidence, limits and separate
   preparation measurements are in [the validation record](history/2026-10-05-next-version.md).

## Next priorities from the gate

- [x] Bind reusable actions to visible sources, current characteristics and exact
  accepted terms. Keep absent equipment available through lookup.
  [Binding review](history/2026-10-06-binding-review.md).
- [x] Reject fabricated button ids and preserve paid search continuations.
  [Strategy cycle](history/2026-10-06-strategy-cycle.md).
- [x] Keep one saved-position manifest with offline replay and live probes.
  [Benchmark guide](../tools/benchmarks/README.md).
- [x] Allow a seat to revise pending combat selections before finishing, with
  ledger-derived progress and historical replay menus preserved.
  [Declaration recovery](history/2026-10-07-declaration-recovery.md).
- [ ] Finish the ordered resource forecast, including earlier entries, activation
  costs, planned attackers and scoped response warnings. Validate future source
  bindings against physical continuations before grading the planner.
  [Payment review](history/2026-10-07-payments-and-execution.md).
- [ ] Derive execution instructions from chosen commitments while preserving
  explicit completion, response, target and exception policies. Cover upkeep,
  opponent turns, triggers and resolution before making it the default. An empty
  list grants no permission to pass.
  [Execution controls](history/2026-10-07-payments-and-execution.md).
- [x] Compare one versus two generated candidates in the shared benchmark runner.
  Neither arm justified adoption. Keep generation experimental and grade useful
  strategy and physical outcomes separately from syntax.
  [Reviewed experiment](history/2026-10-07-payments-and-execution.md).
- [x] Compare inline pregame examples with lossless lookup. Ready wins improved,
  but both arms missed every blocked-lethal win; production remains unchanged.
  [Paired generation gate](history/2026-10-07-payments-and-execution.md#saved-examples-as-references).
- [x] Compare checked consequence feedback with a second look at frozen plans.
  Each arm selected one winning action set in three; treatment had no clean
  repaired-line win. No adoption. [Diagnostic result](history/2026-10-07-consequence-feedback.md).
- [ ] Reuse a prepared line only with positive coverage for the observed change.
  First test an ordinary opposing land play and a draw covered by a land branch;
  a changed blocker must still trigger reconsideration. Syntax, an empty stop
  list and a payable line do not establish strategic validity.
  [Playbook acceptance cases](PLAYBOOK.md).
- [x] Accept scoped work before upkeep choices and review its unfinished line
  after the actual draw. Opening exceptions, trigger snapshots and replay pass;
  generated upkeep wins remain unreliable. [Lifecycle gate](history/2026-10-07-payments-and-execution.md#accepting-the-turn-before-upkeep-work).
- [ ] Preserve future permissions and source dependencies without predicting
  hidden cards or unresolved effects. A reserve must identify its actual use and
  useful window. [Grounded repairs](history/2026-10-06-grounded-repairs.md).
- [ ] After the saved cases improve, audit a full game and three further declared
  seeds for resource reuse, missed wins, wasted temporary development and missing
  phase coverage. Keep Jev and the baseline roster. Completion alone is not a
  strategic pass. [Latest full game](history/2026-10-07-payments-and-execution.md).
- [x] Derive pilot receipt windows from recorded decisions in live play and
  resumed prefixes. Strategy reads structured history without the pilot slice.
  Historical unrecorded looks remain unrecoverable.
  [Continuity checks](history/2026-10-07-payments-and-execution.md#receipt-continuity).

Each cycle starts with the reviewed journal and exact request. Save the smallest
position that exhibits the mistake, state the preferred decision and its
exceptions, then check the context and physical continuation there. Run another
full game after those positions improve. Review that game before choosing the
next changes; a completed game does not close a strategic-quality problem.
An ordinary option and a planned procedure can name the same announcement under
different ids. Both carry out the step when their accepted terms, source, targets
and payment match exactly. The physical ledger row records that progress; a
different mode does not count merely because it plays the same card.

## Measurements and completion

The October 5 four-game batch is the baseline: three outcomes, one classifier
capacity stop, 61-75% of play spent waiting on strategy, and 156 of 393 strategy
requests following refused submissions. The three regular games reused card
assessments; their 7-20 minute preparations were fresh briefs, including timeouts.
Removing whole-card assessment alone will not repair that briefing cost.

Record per-role and per-model calls, tokens, cost, failures, request time and
active time; preparation, play and strategy wait; Jev purposes; plan repairs;
judge requests and rulings; gaps, fallback and replay. Compare cold preparation
and carried preparation separately. Keep the report and timeline for each gate.
Consumed preparations record their queue, start, finish and needed-at times,
with the source turn and version. Reports separate unfinished preparation wait
from total strategy wait and count strategy timeouts. Foreground turn planning
retries the same request after 45 seconds; background preparation retains its
150-second request limit. A retry neither installs a replacement plan nor
changes the model or question. Measure the effect before claiming a speed gain.

Completion requires implemented readiness and execution paths, passing offline
checks, replay/clone parity, and a live gate reviewed without known machinery
failures. Report the observed speed and strategic mistakes honestly. The user's
roughly fivefold speed improvement and expert gameplay are targets to measure,
not claims made by changing a schema or finishing a game. If the gate exposes a
failure, fix its smallest reproduction before another full run.

Both `npm test` and `npm run check` pass before every commit. The remaining work
stays on this checklist; progress does not silently change its acceptance terms.

Recorded-block objections and declaration-time evidence are implemented. The
[live gate](history/2026-10-07-block-objections.md) found 6/6 correct supplied
judge verdicts but 0/3 pilot objections and 0/3 recovery on the illegal case;
exception handling remains open. Current hints are not historical verdicts.
The [supplied coverage controls](history/2026-10-07-supplied-coverage.md) selected
the authored finish and objection in all six replies. Green's lead over help
remained narrow. Generated coverage and post-rollback recovery remain unproven.
The [exact-pair catalog experiment](history/2026-10-07-block-pairs.md) produced
one binding pass, one failure and one inconclusive preparation.
No physical expansion followed; the production catalog remains unchanged.
The [recognition-transfer diagnostic](history/2026-10-07-recognition-transfer.md)
stopped at recognition: two of three selections named winning supplied lines.
No transfer or physical expansion followed; production remains unchanged.

The [blind pregame content comparison](history/2026-10-07-brief-content.md) stopped:
carried and fresh A each produced zero winning commitments in three accepted
plans; B's three slots were unresolved after an analyst failure. No expansion
followed. Normal-load pregame reliability and strategic construction remain open.
