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

- [x] Filter ordinary reusable-action context by visible source bindings, not just
  card identity. A creature already in play must not look like another cast in
  hand. Keep absent equipment available through lookup.
  The shared source reader now serves offers, readiness and planning context.
  Saved-position checks still found stale prior instructions copied into a new
  line; candidate filtering alone did not fix that planning error.
- [ ] Give the turn organizer a concrete resource forecast for its ordered line,
  including which attackers a payment taps. Bind target and response choices;
  prose about retaining mana is insufficient when the line spends it.
- [ ] Narrow post-draw amendments and preserve sound phase policies. The first
  gate amended all 15 preparations; the October 6 gate amended all eight,
  accounting for about 477 of its 534 seconds of strategy wait. First separate
  reusable policy from conclusions tied to an old hand, board or turn. Establish
  positive coverage for draws and changed facts before bypassing a writer call;
  syntax, budget and an empty `askWhen` list do not establish strategic validity.
  The narrow-review trial kept stale advice and failed landfall ordering, so it
  was withdrawn. A repeated full amendment also failed that order and invented
  action keys. Use the acceptance examples in `docs/PLAYBOOK.md` and
  compare both covered changes and changes that must trigger reconsideration.
- [x] Prevent newly authored fake button ids and verify paid searches separately.
  Land and combat movement now have reusable selectors. Literal picks must name
  actual options or stable continuation ids. The next gate's two empty fetches
  now complete in their isolated resolutions, while deliberate failure-to-find
  intent remains usable. See [the October 6 review](history/2026-10-06-strategy-cycle.md).
- [ ] Ground entry and combat forecasts in accepted characteristics. The opening
  writer still invented haste for Kellan, and resource prose contradicted the
  available sources. Preserve those draw positions and fix the factual question
  before another full gate. Preparation must also cover the next upkeep so the
  pilot does not improvise from an expired turn's general guidance.
- [x] Establish one runnable saved-position manifest. `npm run benchmark` validates
  17 saved prefixes offline; `--live` runs selected pilot, preparation, amendment or repair
  probes. It records expected properties, whole-decision timing and every call.
  Known good and bad landfall amendments can be checked without inference.
- [ ] Extend those benchmarks to changed blockers, clocks, covered draws and
  stale factual guidance. Action-order checks alone do not establish playing
  strength. Check improvement before another full batch, then compare matching
  seeds with preparation measured separately.
  The second round adds a funding-land prerequisite and an established attacker
  that old guidance wrongly held back. Exact reusable-key schemas, complete
  reference diagnostics, shared action descriptions and consistent player
  references are implemented. Broader prompt and plan-reset experiments did
  not establish coherent play and were withdrawn.
- [ ] Ground commitments and future continuations in structured facts. A reserve
  should identify its response source and useful window. A proposed resolved
  permanent can enable a graveyard land or another use absent from current
  offers. Expose that dependency as a conditional forecast, retaining unknown
  mills, responses and unresolved choices as unknown. Do not ask the writer to
  reconstruct these dependencies from a missing option and long prose.
  The equipment lookup now reads accepted unconditional land permissions
  on a named ordinary permanent cast. It shows the resulting allowance and visible
  lands in newly opened zones, with an explicit resolution assumption. It does
  not simulate instructions or unknown cards. `objects.types` now selects any
  listed current type from projected characteristics. Response-source bindings
  and repeated live validation remain open.
  Automatically attaching every permission forecast did not improve the repeated
  action checks, so that attachment was removed. The per-card lookup preserves
  access without adding speculative continuations to unrelated questions.
  Movement actions now bind their selectors to current types, tap state and
  sickness. Old holds show whether their existing release condition holds.
  Resource context includes permitted visible graveyard and exile lands beside
  hand lands. These facts diagnose stale commitments without rejecting future
  transformations. The first repeated answers still copy false prose; source
  bindings alone do not close the repair problem.
  A compact current-position sheet now exposes complete creature rosters, the
  visible hand, available mana and land permissions. In three repeats of three
  failing repair/amendment positions, structural checks improved from 1/9 to
  8/9. False resource claims remain in otherwise passing answers. Broader saved
  positions and physical continuations precede the next full-game gate.
  The latest continuation also shows a listed winning attack omitted during
  execution. Actual resource commitments now drive hold marks, and saved pilot
  probes include the live loop's annotations. New strategy submissions must
  supply a comparison bound in plan amount conditions; legacy replay is intact.
  The ordered resource forecast now accounts for tap costs and activation
  spending zones. Fixed-candidate recognition passed six Luna-low calls across
  tool and text answers, with checked payments supplied. Generating candidates
  still produced four payment conflicts in six replies and contradictory prose.
  No new planning stage was adopted. Next, expose scoped payment witnesses and
  check candidate commitments before binding the phase instructions. Generated
  plans must execute coherently before the full-game gate.
  The [October 7 payment and execution round](history/2026-10-07-payments-and-execution.md)
  adds payment witnesses and marks payments that tap planned attackers. A
  supplied line executed three times when phase instructions came directly from
  its selected actions. Candidate generation remains unreliable; the new
  proposal and instruction-rendering experiments are not production policy.

The [October 6 review and tune round](history/2026-10-06-review-tune.md) compared
Jev and Luna low on identical pilot questions. Jev matched 27/27 expected
decisions at 253 ms median; Luna matched 24/27 at 1,714 ms median. Keep Jev as the
pilot. A narrow Luna exception review is a candidate experiment, not a new
production role. Defer preparation restarts and timeout changes until prepared
reuse has been tested, so waiting improvements have an identifiable cause.
The [second tuning round](history/2026-10-06-binding-review.md) records the
remaining false source claims and a factual-audit probe. The audit found real
mistakes but also false positives, so it is not an automatic acceptance gate.
The [repeated planning review](history/2026-10-06-repeated-planning.md) compares
three runs per planning case and preserves a later failed repair after Explorer
resolved. Current facts were present; the writer still repeated an obsolete
creature-land claim. The next repair question must bind combat and resource
commitments to current sources instead of asking for another prose inventory.

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
