# Pregame policies and turn organization

The pregame prepares decisions that recur. Luna binds them to the visible
position and checks the exceptions. Jev executes that line and asks for help
when the prepared decisions no longer cover the position. A policy is advice;
it neither certifies a card's meaning nor guarantees the best move.

Opening has separate keep and bottom policies for playing first and drawing
first. The other five families each name applicability, ordered priorities,
resources to reserve, a reconsider condition and a worked example. Examples
use the actual registered lists. These are the questions they must settle:

| Family | Example position | Preferred prepared decision | Exception |
|---|---|---|---|
| Opening | A seven that must lose a card after a mulligan | Evaluate the retained six; preserve castable development and its colors before redundant payoffs | An immediate matchup threat requires the only early answer |
| Sequencing | A landfall beneficiary in hand and a land play available | Cast the beneficiary, wait for resolution, play the land, then resolve the trigger under its target policy | The beneficiary cannot be paid for without that land, or waiting loses an answer window |
| Resources | Creature-restricted mana and unrestricted mana, with development and an instant available | Pay for the creature from restricted sources; name the unrestricted sources reserved for the response | The response no longer has a relevant target or spending now wins |
| Responses | A response and a discretionary instant compete for the same mana | Keep the response through its last useful window; spend on the discretionary instant only after its release condition | A must-answer threat appears, or a different response is needed before then |
| Combat | An evasive clock, grounded blockers and a race | Name which creatures attack, which can block the expected threat, and how damage advances or prevents lethal | A removal spell or changed characteristics alters those assignments |
| Recovery | The engine is removed or the draw changes available mana | Use the prepared alternate route, replace unfinished steps and their holds together | Neither route covers the new threat; request a new line with that mismatch stated |
| Paid search | A fetch has been sacrificed, a basic land is offered, and no card is chosen yet | Choose the land to fulfill the accepted search, then finish its remaining instructions | The recorded purpose deliberately calls for finding nothing, or an uncovered change needs help |

An example states enough facts to follow its arithmetic: costs, usable sources,
spending restrictions, intended targets, and what remains. It distinguishes
casting from resolving, and a forecast from an event already recorded.
The paid-search question states that choosing none completes an empty search;
it cannot postpone the activation or preserve the sacrificed fetch. The original
target policy remains authoritative, including an intentional failure to find.
That is execution guidance for Jev, not a forced choice or a new strategy call.

The deck analyst owns sequencing and resources. The matchup analyst owns
responses and combat. The challenger owns recovery and exceptions. The opening
analyst owns retained-hand decisions. The tool schema enforces those separate
policy destinations. Supporting conclusions can be empty when the policies
already settle the assigned question. Synthesis reads the drafts together and
replaces only families that need reconciliation; omitted families carry forward
unchanged. A failed analyst stays visible as a failure.

Whole-turn preparation receives all five families because its line commits
resources through the opponent's turn. A response repair during the opponent's
turn reads resources, responses and combat; the scheduled preparation handles
the next own turn. New playbooks replace the older duplicate route and matchup
paragraphs in this context. Carried briefs without policies keep their old fields.
Existing phase scripts arrive as the base plan, and card notes arrive for visible
identities. Full visible card text remains available.
The planner reads each offered spell or activation mode with its locked cost
and target bindings. Reusable actions spell out omitted printed costs. Jev reads
the physical payment choices after the planner chooses the mode and resources.
Strategy reads accepted claims and quoted meaning; executable bodies remain
available through equipment when an interpretation needs inspection. The base
plan names those reusable actions instead of repeating their programs. Past
physical picks remain history, since their old incarnation and payment cannot
serve as reusable equipment. Current position facts follow the background and
prior plan, and currentWindow gives the response window in plan syntax.
Position objects are grouped by their actual zone and controller, with empty
hand and battlefield groups shown explicitly. A cast candidate in hand or exile
does not appear among current battlefield creatures.
Reusable uses bind the source's current zone, incarnation and this seat's
permission, without requiring current mana or targets. A creature already in
play is not another cast. A second copy in hand is. A hand-only alternate cost
does not become an exile cast; next-turn preparation can consider an earned
permission that opens on that turn. Unbound steps in prior intent stay visible
for repair. Other absent equipment stays accessible through lookup, so a draw
branch or an earlier return-to-hand effect can still prepare its continuation.
The submission schema lists exact reusable keys. All unknown keys are reported
together. Identical executable terms and identical displayed facts share one
description through `sameAs`; each original key remains usable. Matching card
names or claims alone do not merge different modes or instructions.
The pilot's pending actions carry their required windows and whether the window
is closed or the condition is false. A main-phase cast in the plan calls for
passing through draw under the response policy, not choosing an unrelated
activation with its mana. Every pass still goes through Jev.
For a response repair, the writer submits `current` actions with labels and
purposes. Context binds them to the exact current turn and step and replaces
only that window's unfinished steps. Other steps stay. The model cannot put
an opponent-turn response into its own draw step. Core still receives an
ordinary complete plan; Jev still selects each physical action and pass.
Visible lands and battlefield creatures have reusable movement selectors beside
the accepted spell and activation uses. The writer chooses among them without
constructing button ids. A land selector names its card and permitted zone; a
combat selector names one current creature incarnation. These are candidates,
not promises of a legal land play, attack or block. New literal ids must already
be offered, apart from the stable pass and declaration-ending ids. Future casts
reuse accepted terms; future movement uses selectors. Existing plans and journal
entries retain their original meaning.
For example, a normal five-mana cast and a three-mana warp remain two different
uses even if they put the same creature onto the battlefield. A plan reuses the
chosen procedure; it does not copy a payment id while describing another mode.

A hold query reserves every matching object. Keeping one Forest for a response
requires its exact id and incarnation, not a query naming all untapped Forests.
The forecast reads an exact pick's structured source, locked cost and payment;
it cannot silently swap the source to make an inconsistent reservation fit.
For a normal single block, the decision includes damage and survival arithmetic
under explicitly stated assumptions. Responses and later effects still need the
policy's exception guidance.

Draw branches test the visible hand after drawing. For example,
`{amount: {count: {zones: ["hand"], controller: "you", types: ["creature"]}}, atLeast: 1}`
tests for a creature in hand. `top` names library objects and cannot stand for a
hand or battlefield test. The ordinary planning reference carries counts, life,
history and combinations; instruction bindings stay in the full syntax lookup.
Player references accept `self` as a synonym for `you`, including conditions;
both mean the evaluating source or seat's controller, not the active player.
Preparation labels both the table's alternating turn counter and the seat's own
turn number. Neither number is a mana forecast.
Preparation must answer the upcoming turn from a clearly labelled forecast,
not from the opponent's current priority question. For example, two tapped
Mountains and a Kellan already in play become two untapped sources and the same
Kellan after a normal untap. The line may upgrade or attack with that creature;
it cannot cast it again. The next draw is unknown and belongs in a conditional
branch. Prior phase prose is intent to revise, not a record of the current hand.
Forecasts retain current characteristics and assume the visible permanents
survive; changes before the draw still require review.
Each source-bound use also shows whether its mana cost can be paid before other
actions, and after one named land drop. This is a resource preview, not a timing
or target check. For example, a land entering tapped under another permanent's
restriction cannot supply the missing fourth mana. Variable costs and additional
costs remain explicitly unpriced. The ordered line must still account for earlier
spending, held sources and effects that change the resource picture.

The turn answer acknowledges applicable policies in its guidance or phase
script and binds them through ordered steps, conditional responses and holds.
It carries later-choice purpose on the announcing step. It updates an uncovered
case without rewriting accepted card meaning. If facts contradict the example,
the example does not override the facts.

## Prepared-turn acceptance examples

These define the next acceptance experiment, not the current `settled` handler.
The current handler still requires no change beyond a covered draw. A valid
resource budget does not prove the attack or response policy remains sound.

Before preparing a line, distinguish reusable advice from bound conclusions.
"Preserve green for protection when protection is in hand" is a policy.
"Keep this Forest for Veil" is a conclusion that depends on the current hand,
source and purpose. A previous turn's sickness, mana count or lethal estimate
must not become the next turn's default fact.

| Prepared coverage | Change at the draw | Preferred handling | Required check |
|---|---|---|---|
| Develop the named threat; the response policy covers an additional opposing mana source | Opponent played and tapped an ordinary land; draw matches the land branch | Accept the prepared line without a writer call | Source and payment still work; the covered response and combat conditions hold |
| Attack only while the named attack remains safe; new blockers are a stop | Opponent added a blocker | Review the combat line and its response resources | Mechanical validity does not settle damage, trades or the clock |
| Use a land draw before a spell that needs it | The drawn land supplies the required color and enters untapped under accepted terms | Follow the existing branch | Check the entry restriction and ordered payment, not just printed mana production |
| Existing draw branches do not cover a new relevant spell | Draw adds removal or a different development line | Ask a narrow comparison against the prepared line | Consider timing, target and reserved mana before keeping or changing it |
| Cast the beneficiary before a land or fetch | The fetch is gone, but a land is in hand and existing sources pay for the beneficiary | Replace the missing continuation; retain beneficiary before land | A repaired line must preserve the dependency that made the sequence useful |
| Hold a response until the opponent's last useful window | A changed threat makes that response ineffective, or a required source is lost | Replace the response and affected spending together | Do not preserve a hold that no longer has its stated purpose |
| No declared coverage for a changed position | Syntax and mana checks still pass; `askWhen` is empty | Review, rather than treating silence as permission | Missing assumptions are unknown coverage, not a strategic judgment |

The preparation question should select the applicable pregame policies, bind
the ordered line and resources, cover likely draws, and state what invalidates
those decisions. Shared condition machinery can evaluate those declared facts;
it cannot infer strategic irrelevance from a card name or an unchanged action id.

A remaining amendment asks which dependency changed, whether the existing line
still serves its policy, and which actions, holds or bound conclusions need
replacement. Give it the affected complete policy families and the current
facts. Other complete policies remain available through lookup. Do not remove
strategic context merely because the old plan passed syntax validation.

Accepting unchanged fields must be deliberate. A narrow question should allow
`{}` when the line remains sound, without encouraging it to keep stale advice.
The October 6 experiment failed that distinction; its production shortcut was
withdrawn. The [review record](history/2026-10-06-review-tune.md) and
[benchmark instructions](../tools/benchmarks/README.md) preserve the evidence.

The [second tuning round](history/2026-10-06-binding-review.md) confirms that
correct action order can coexist with unusable guidance. Next, bind response
reservations to actual sources and expose continuations enabled by a proposed
resolved permanent. For example, a graveyard land unavailable now can become a
candidate after the prepared spell grants permission. Keep that forecast
distinct from a current offer and from unknown results such as a future mill.

The interpreter still owns missing executable uses. Source checks, plan shape
checks and payment forecasts are separate from strategic quality. Compare
accepted plans, corrections, strategy wait and actual decisions in the saved
calls before claiming the playbook made Luna stronger or faster.
