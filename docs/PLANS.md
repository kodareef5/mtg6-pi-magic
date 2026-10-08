# Plans

## Next version: shared mechanics and prepared strategy

The October 5 contract defines shared mechanics and prepared strategy.
Implementation and playing strength are separate: [current results](STATUS.md)
have not established coherent full-game strategy.

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
A model-backed seat can keep the accepted plan after a covered rules draw
without calling the writer. It must have observed the accepted position and
verify that only the drawn cards and their hand/library counts changed. Every
drawn card needs a matching remaining step or true branch. A reset or resume
without that observation uses the writer. Keeping records no physical action
and preserves progress.
Context renders each step's execution choices before
announcement and throughout inspection. Resolution recovers the announcing
plan's step and phase policy, including triggers. General objective and guidance
remain audit rationale. Completion is explicit per window; missing instructions
grant no pass.

Strategy analysts read the projected position without the matchup plan,
notebook or standing plan. The coordinator receives both their proposals and
that prior intent, and must reconcile them. No physical facts or card text are
removed from analyst context. Reset, close and supersession cancel the survey,
outlook and coordinator rounds through the same signal; canceled attempts stay
in the bill and cannot publish later work.

A response normally edits only its current window. If the inherited plan is
invalid, strategy instead exposes the existing full editor: validation of the
whole plan cannot be repaired through fields that preserve the invalid part.
The writer must explicitly remove or replace those commitments. Context never
rebinds an old incarnation or drops a step on the player's behalf.

Strategy can read accepted activations for its visible cards before their
sources enter a permitted zone. These entries name the current sources and
state that the use is unavailable. Reading equipment adds no move, predicts
no entry and grants no permission. The writer can reuse the exact terms after
an earlier action supplies the required source.

## Objections

The pilot can object to a just-finished opposing block before the next physical
decision. Current conflict hints are facts, not historical verdicts. The judge
receives the position reconstructed before the declaration, its participants,
accepted characteristics and printed text. A stand or failed ruling suppresses
another offer for that action on the same branch. A failed ruling is not a
verdict; its explanation survives resume. A rollback reopens a revised action,
restores pending choices and requests new plans from both seats.

The current policy suppresses an objection after a failed judge session,
including exhausted transient retries. Repeated illegal declarations after
rollback remain an unresolved recovery risk. Do not claim that replay or zero
gaps certifies legality.

## Remaining work

- Simplify strategy authoring without changing the model roster. Choose a line
  and preserve its commitments through executable instructions, including
  resources, targets, waiting, combat and completion.
- Reuse accepted preparation and covered draws without redundant writing.
  A changed blocker or uncovered draw still needs reconsideration. Syntax and
  payment validity alone do not establish strategic coverage.
- Preserve resource and permission dependencies across unresolved effects.
  Distinguish an unavailable action from one enabled by an earlier commitment.
- Exercise objection recovery and repeated rulings without silently choosing
  for either seat.
- Measure whole games on fresh seeds. Report missed wins, false rules beliefs,
  policy obedience and legality separately from outcomes and replay health.

## Change and measurement rules

A factual or interface correction needs a reproducible offline invariant.
A prompting or behavior change needs comparison across varied positions before
adoption. An unchanged packet repeated three times is a stability check, not
three independent cases. A failed behavior experiment is removed rather than
left as a production flag.

Use the shared runner for paid probes. Record calls, tokens, costs, wall time,
strategy waiting, preparation readiness, repairs, judge attempts, gaps, fallback
and replay/clone parity. Preserve failed and canceled calls in the accounting.
Keep hypotheses, raw results and long reviews in ignored `design-ref/` or `.pi/`.
Published notes contain only current decisions and a short results summary.

Both `npm test` and `npm run check` must pass before every commit. No inference
runs in either. Full-game completion requires coherent choices and legal play,
not merely reaching an outcome with a healthy journal.
