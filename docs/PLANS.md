# Plans

The pregame settles the matchup. Strategy advances that reasoning as the position
changes. Jev flies the ordered actions and the guidance for the current phase.
Core accepts a complete `PlanSchema` plan; the strategist can write a short update.

## The planning loop

1. **Setup.** Before dealing, the pregame model assesses every registered card
   with rules text. Each seat keeps complete packages for both public lists,
   including their sideboards, so taking control does not lose a card's meaning.
   Four assessment jobs run at most at once. Accepted terms are saved at version
   zero; missing text or unsupported operations stop setup. Four pregame analysts
   then study resources, the matchup, opening hands
   and likely mistakes. A synthesis writes the brief. Its step decisions become
   the initial phase scripts, and its short objective supplies Jev's strategy
   line. New briefs give separate keep and bottom policies for playing first
   and drawing first. Jev reads only its current policy, beside projected hand
   counts and printed costs. Carried free-form opening notes stay intact.
   The brief also supplies upkeep guidance, so there is no extra opening
   strategy session before the draw.
2. **Think ahead.** At the start of the opponent's turn, one strategy session
   prepares the seat's next turn from its projected position, brief and accepted
   work. It writes the ordered line, mana commitments, phase decisions and
   responses. The next draw remains unknown; conditional branches cover draws
   that change the line. It does not change the table.
3. **After the draw.** Use the preparation directly when the position is quiet,
   the plan passes its checks and a live step or branch covers the draw. Otherwise
   the same planner amends it for the changes and the revealed draw. If preparation
   is still running, wait for that job. If it failed, plan from the current frame.
4. **Fly the turn.** Jev reviews unfinished uses, then chooses an action or pass. A phase change
   spends no strategy call. A stop or a request for help uses the same planner to
   change the unfinished line.

There is one planner per seat. A stop, replaced plan, rewind or seat closure
cancels stale preparation. Its notes and plan are discarded together. A clone
carries accepted work, never an in-flight job. Closing a run waits for cancellation
before reporting its bill.

No challenger, note-taking session, timeout race or delayed note merge sits beside
this loop. The pregame challenge remains part of setup.

## Short answers, complete plans

The writer's `submit` tool takes changed plan fields directly, optional `notes`,
and an optional `objection`. Omitted fields keep the supplied `base`; lists replace
their whole lists, and `[]` clears one. `{}` keeps the base. There is no outer
`plan` or `changes` object.
Packages join by card name instead: a new package must not drop a package still
waiting in preparation, and an empty package list does not remove accepted work.

For a new turn, the base keeps strategic and phase defaults but clears the ordered
steps. For a midturn amendment, it removes completed steps. Packages already in
private work need no repetition. Existing bounded response and phase windows are
shifted to the next pair of turns; the writer sees that base before updating it.
Prefer `active` and `step` to unnecessary absolute turn numbers.

The writer also receives `actions`: prepared procedures, current steps, branches
and earlier executed actions for visible cards, plus generic actions. Each has
a key containing its name, a label and full accepted syntax. A step's `reuse`
copies that complete key, such as `"worked:0 Play Forest"`, from the supplied
dictionary. The name helps distinguish a cast from a land play before selecting
it. This copies the exact action, including its
selectors, targets and costs. A changed action must be written again. These are
seat-authored terms. Core offers assessed procedures whenever their timing,
sources, targets and resources fit. A turn plan chooses a line from that repertoire.

`src/context/plan-edit.ts` merges the answer and expands reuse keys. The result
goes through the ordinary atomic `plan.put` writer. Core and the journal hold
complete terms, so replay needs neither the model nor the update vocabulary.
Reusing accepted syntax does not certify its interpretation. The `equipment`
lookup reads another named card's accepted package and actions with the same
keys, including cards not currently visible. Neither lookup nor plan acceptance
performs an action.

| Plan field | Purpose |
|---|---|
| `objective` | The role, route to a win and what changes it. |
| `guidance` | The chosen line and why the main alternative loses. |
| `steps` | Ordered actions with windows and optional conditions. |
| `may` | Conditional responses and alternative lines. |
| `askWhen` | Visible facts that make the line impossible. |
| `holds` | Resources kept for a purpose and the condition that releases them. |
| `phases` | The current window's goal, decisions, and reasons to re-evaluate. |
| `packages` | Corrections to assessed card registrations and procedures; they persist in private work. |

`docs/examples/turn-plan.md` shows a complete plan. The writer receives the real
plan and condition definitions, current card text and the whole pregame brief.
The `syntax` tool supplies `docs/SYNTAX.md` and the complete nested schema when
changing a procedure or package. The `example` tool supplies worked uses.
The advertised tool schema stays shallow: provider expansion of recursive
definitions made a measured strategy request exceed 430,000 input tokens.
Exact local validation still checks every nested term. Card, equipment, rule
and odds lookups remain available. A session has up to three replies for a
needed lookup and correction.

A repair starts at the current window and reads the table's remaining steps,
including repeats and insertions. Its base is earlier intent, not a source of
physical facts. The writer repairs guidance, actions, affected phase scripts
and holds together. Mana context counts each untapped source once, marks tapped
permanents unavailable for tap costs, and preserves spending restrictions.
A refused submission describes a proposed plan; its feedback states that no
action occurred and the supplied position is unchanged.

## Memory

The brief holds the stable deck and matchup reasoning. `Workspace.notebook` holds
useful new conclusions by topic, private to the strategist. Optional
`notes: [{topic, note}]` edits travel in the same submission as the plan. An empty
note retires a topic. Omitted topics remain. Notes have a 200,000-character limit;
they are journaled and cloned, and never shown to Jev. There is no requirement to
write a note each turn or fill that allowance.

## Execution and checks

Core reads the plan at each decision: due steps, applicable branches, held
resources and stops. Jev chooses every voluntary action, priority pass and
attacker or blocker declaration, including choosing none. Both seats receive
their priority windows. Silence in a plan grants no permission to pass, and a
unique planned action still goes to Jev. Every physical option remains available,
marked and ordered by the plan.

Compulsory single-option rules operations remain forced. A unique instruction
while resolving a card is delegated only with that seat's explicit authorization;
the model adapter no longer supplies blanket delegation. Call counts must be
read by decision kind, alongside time, spend and gaps. A high forced ratio is
not a gameplay target.

An essential step that cannot be taken where it belongs asks for another plan,
within the escalation budget. A resolving spell is allowed to finish first.
If the stop is spent, Jev still chooses the action or pass; the table does not
invent a decision on the seat's behalf.
`askWhen` also raises a request when its named visible condition becomes true.

The writer checks the expanded plan with the same core validation before
returning it. `budget.ts` forecasts land plays, card use, payments, floating mana
and retained responses. It reports conflicts once per session; physical payment
validation remains authoritative. Effects, conditional lines, reductions and
large payment searches can exceed that forecast. An empty conflict list proves
neither the sequence nor the card interpretation correct.

Progress is read from ledger rows carrying `execution: {plan, step}` or
`{plan, branch}`. Amendments omit completed steps before replacing a plan. Replay
and clones read the exact accepted terms and progress from their prefix.

## Jev's context and timing

At priority and combat declarations, `core/review.ts` lists the phase strategy,
unfinished steps and branches for this window, other cards with offered uses,
cards still in hand during the seat's main phase, and a pending stack
response. An unavailable planned use stays on that list. Jev answers one narrow
review question per item: use now, hold for later, no use in this position, or ask
strategy for help. Once a reviewed step or card has an action to take, Jev
chooses it before reviewing later steps that depend on it. If Jev instead asks
to end the window, `review.finish` requests the remaining reviews, followed by
a fresh confirmation. That request is not a pass. The move question keeps every offered action and
shows those judgments. Both seats separately review a stack response and choose
their own pass. The pass says whether unanimous passes would resolve the stack
or end the current step or phase.

While the stack waits, its response review precedes unfinished uses. Jev holds
land plays and sorcery-speed uses until the stack clears, then reassesses them
against the changed position. Waiting for resolution alone does not need a
strategy repair; other conflicts can still justify asking for help.
Reviews also name actions already recorded for the plan. An unused card in
hand is a use to consider, not an obligation to perform it.
For a phase with explicit steps in this window, the checklist names its
remaining unrecorded actions. An empty list means those actions were taken;
pending effects, responses and further phase instructions still need review.
It does not declare the phase over or certify that its strategic goal succeeded.

`review.record` is a private seat tool, available to every player adapter. It
records a judgment and its reason at the current physical revision; it moves
nothing and never completes a plan step. Reviews survive a clone or resume at
that decision. A physical action or a changed plan requires fresh review. The
checklist is derived from the projected position and accepted work, so it cannot
inspect a hidden card or certify a card's interpretation. A seat can still pass
or take any listed move directly. The model adapter guides review before making
that choice; core does not force a strategy on the seat.

A resolving use has a different question. Jev receives the accepted claim,
source text, remaining instructions and the plan's objective for its choices.
The next phase's casting guidance is left out. A sacrificed source still
supplies its public card text, and stack objects describe their accepted
effects. Completing an announcement never counts as completing its resolution.

In a scripted phase Jev sees the objective, that phase's decisions and ordered
steps, applicable branches, holds, options and projected facts. It sees no
notebook or whole card procedures. It does see full printed text for visible
battlefield and stack cards and the sources and targets its options name.
Printed text and current characteristics are separate: losing flying changes the
latter, not the source text. Hidden object identities remain absent.
Visible creatures carry their current summoning sickness, computed against their
controller's turn and haste. Both seats read that same fact. Registered watches
name their source and the visible objects matching their selector now; a match
is neither an event nor a promise that a future trigger will happen. Next-turn
preparation separately states its assumption that retained creatures lose
summoning sickness when that turn begins.
Outside a script, the brief's matching notes
and recent recaps remain available. `ask:help` covers a named unexpected event or
a plan that cannot be carried out, including a conflict with card text or a
restriction; it is not permission to improvise strategy.

`planned` records the actual decision-boundary wait, readiness, result and failed
sessions. `tools/stats.ts` separates prepared, amended, written and escalation
plans. Call durations and cancelled preparations remain in the bill; overlapping
background time is not the same as time waiting for a turn plan.

Before another live run, finish the component checks in `docs/STANDARD.md`:
assessment, entry and resolution, priority, planning, projection, and replay.
Then inspect one bounded live opening before extending a game. Offline checks
establish mechanics, not provider latency or expert playing strength.

## Next round: focused Jev context

Design the preferred use first: representative situations, actual questions and
answers, then the preparation needed to make those questions answerable. Review
coverage before choosing builder boundaries or changing prompts. Existing
requests are evidence for regression checks, not the specification to prune.

This section is a proposed usage contract, not a shipped interface or a claim
of optimal play. The longer worked sequences stay here so a reader can check
what passes between pregame, strategy and Jev without reconstructing it from
separate prompt fragments. Syntax examples in `docs/examples/` describe today's
accepted terms; the new inspection and preparation forms below are design work.
Keep Jev as pilot, Luna low for strategy, judge and summary, and Sol 6.1 high for
pregame. Core continues to receive model-assessed card meaning before play.

### Classes of questions

Group by the judgment being asked, then vary the position's complexity. A card
name or a phase is not a new question class. One phase can require several
classes, and one class can serve several phases.

| Class | Question the example must answer | Simple case | More demanding case |
|---|---|---|---|
| Apply a policy | Which listed choice satisfies this prepared policy here? | Keep a playable hand | Bottom several cards while preserving a functional retained hand |
| Review a use | Is this use ready, waiting, unnecessary or outside the plan? | Play the due land | Distinguish a missing prerequisite from an effect already pending |
| Bind an action | Which source, mode, targets and payment carry out this use? | Cast a creature with one payment | Shared mana, restricted mana, X, additional costs and dependent targets |
| Continue a sequence | What is the next unfinished action, and what must happen first? | Land, then creature | Creature, landfall, fetch, more triggers, protection and combat |
| Answer an interruption | Does a prepared response apply to this event? | Pass on an irrelevant spell | Protect the threatened object while another response is pending |
| Resolve an instruction | Which choice carries out the accepted use's purpose? | Find the intended basic land | Optional choices, earlier bindings, vanished targets and delegated steps |
| Arrange simultaneous work | What order and bindings give the intended resolution order? | Two independent triggers | Targeted and reflexive triggers, different controllers, changing conditions |
| Declare combat | Which declarations and damage assignments execute this combat plan? | Attack with one creature | Evasion, menace, multiple blockers, trample and separate damage steps |
| Finish a window | What remains, and what would this seat's pass actually do? | Empty upkeep | Held uses, pending effects, remaining obligations and another seat's response |
| Revise or clarify | What fact, rule or broken assumption needs another answer? | Look up a timing rule | Uncovered draw, lost resource, contradictory guidance, objection or rollback |

Every class needs contrasting examples. Vary whose turn it is; empty versus
occupied stack; one versus several choices; known versus conditional outcomes;
shared resources; prior selections; and unchanged versus invalidated guidance.
An example needs a reason its context is sufficient, not a target character count.

### What each writer prepares

Start with the Jev question and work out what its producers must supply. Do not
ask the strategist to write prose that happens to resemble today's option
labels. The following are content contracts, not new JSON fields.

| Producer | Supplies | Must leave to its consumer |
|---|---|---|
| Card assessment | Complete accepted uses, timing, costs and restrictions, target relationships, registrations and resolution obligations, with source coverage | A matchup preference, a live target or an assertion that acceptance proves legality |
| Pregame analysts and synthesis | Opening policies; normal sequences; response priorities and last useful windows; resource reservations; resolution purposes; combat roles; the visible conditions that reverse each default | Hidden arrangements, future draws, live object ids and a fixed turn script regardless of the board |
| Strategist | The applicable default, current goal, ordered uses, concrete bindings or selection policy, resource commitments, expected completion evidence and covered alternatives | Card meaning already assessed, invented offers, or an unresolved strategic choice disguised as "use wisely" |
| Core and context | Projected facts, derived comparisons, actual offers, progress and the preparation applicable to this question | A new strategic preference, a hidden fact or an automatic voluntary choice |
| Jev | An offered review answer, inspection choice or move id that applies the preparation to this position | A new multi-turn strategy or a fabricated action |

For each prepared use, the examples must settle: why take it; when; with which
source, targets and resources; what to preserve; what its later choices should
accomplish; what shows it is pending or complete; when to wait, use a covered
alternative or ask for a revision. Shared policies need one home. A step should
refer to its protection policy rather than copy it into contradictory prose.
These requirements need not become one new schema or a wrapper around every use.

A useful pregame direction is: "For each recurring decision, give a preferred
use, its assumptions, the visible condition that changes it, and instructions
for the choices it creates later. Name unresolved alternatives for strategy."
A useful strategy direction is: "Bind those policies to this position. Resolve
resource conflicts and choose the line before asking Jev to execute it. A change
to an action also changes its affected guidance, holds and continuation purpose."
Neither direction promises a legal or winning line merely because it was accepted.

### Worked question sequences

These are preferred interactions using cards in the pinned matchup. They are
constructed positions for design, not new game results or complete registered
deck lists. Later fixtures must build them from the kept registered decks.
Named objects such as Forest A denote one projected object and incarnation;
actual requests use the original offered ids, never these aliases as an API.

Each example states preparation, facts, an actual preferred question and the
answer's consequence. Quoted questions are proposed wording. Card names refer
to the pinned complete card records; a real request includes the relevant full
printed text once, current characteristics separately, and applicable registered
effects. The examples do not authorize clipping that material. Choices below
illustrate the decision; any other real offered action remains accessible.
Each request must stand alone: carry the applicable preparation, current facts
and earlier bindings it needs. The model is not assumed to remember the preceding
question or the rest of this document. Proposed inspection answers remain separate
from physical move ids until the final pick.

#### 1. An ordinary pass

**Preparation:** Pregame has no upkeep use for this position. The current plan
holds resources for the main phase. **Facts:** It is Green's upkeep; Green has
priority; the stack is empty; no trigger, instruction or applicable use waits.
The only physical offer is pass.

**Question:** "Pass priority in this upkeep? No prepared use is due and no response
is needed. Your pass gives Red priority; if Red also
passes without acting, upkeep ends."

**Answer and continuation:** Jev chooses the original pass id. Red gets its own
question from Red's projected facts and preparation. Neither pass is forced.
**Changed case:** In Red's upkeep, a Smaug trigger waiting on the stack makes
this a response question about that trigger. Passing does not end upkeep.

#### 2. Keep, then choose the hand to retain

**Preparation:** For this example, pregame's play-side policy keeps two green
sources with early development; when bottoming, preserve those sources and the
Chocobo/Curator start, then retain Ascension ahead of a redundant three-drop.
This is an attributed matchup policy, not a rule shared by every deck.

**Facts:** After two mulligans, Green sees Forest A, Forest B, Chocobo, Curator,
Ascension, Hydra and Veil. Keeping will require two bottom choices and leave five.
**Question:** "Keep this seven to form a five-card hand under the opening policy,
or mulligan?" The packet shows the retained-hand requirements beside the cards.
The replacement hand is unknown; any odds must name their projected-count basis.

After keep, **question:** "Which card goes on the bottom first? Two must leave;
preserve both Forests and the Chocobo/Curator start." The policy permits removing
Veil, then Hydra. The second question shows the first selection, one remaining
obligation, and the hand and mana sources each candidate would leave:

| Second bottom choice | Green sources retained | Change to the prepared opening |
|---|---:|---|
| Forest A or Forest B, each with its own offered id | 1 | Lose the second source needed for Curator |
| Chocobo | 2 | Lose the planned one-mana development |
| Curator | 2 | Lose the planned two-mana development |
| Ascension | 2 | Retain Hydra instead of the preferred three-drop |
| Hydra | 2 | Retain the prepared five-card hand |

These are facts relative to this policy, not labels claiming that other hands
are bad. The question does not reuse the original seven-card analysis.

**Changed case:** With only one green source, this policy's keep condition does
not hold. Jev must apply the separately prepared one-source policy or ask about
the uncovered case, rather than claim that two lands are present. With no
planner available during opening, an uncovered case must be reported honestly.

#### 3. Pay for development without spending the response

**Assessment:** Village's accepted red mana is restricted to casting a creature
spell. Its unrestricted ability produces colorless. **Strategy:** "Cast Hired
Claw now. Preserve Mountain A for Shock on the opponent's turn."
**Facts:** Empty stack, Red's main phase; Village and Mountain A are untapped;
Claw and Shock are in hand. Both sources can fund Claw's red cost. Only Mountain
A can fund Shock's red cost afterward.

**Review question:** "Is the planned Claw use ready while retaining Shock?"
**Payment question:** "Which offered payment casts Claw and preserves the named
response: Village's creature-only red, or Mountain A's unrestricted red?"
Both alternatives show what remains usable, not just "one mana left."

| Payment | Untapped source afterward | Can that source pay for Shock? |
|---|---|---|
| Village's creature-only red | Mountain A | Yes, unrestricted red |
| Mountain A's red | Village | No, colorless or creature-only red |

**Final question:** "Cast Claw with Village's red using this offered move, inspect
another use, or pass?" Jev chooses the original move id; review paid nothing.

**Changed case:** A tapped Village makes the preferred payment unavailable.
The context names the conflict with the Shock hold. It does not silently spend
Mountain A. A standing effect that turns Village into a Mountain must be included
because it changes the comparison; printed text alone is insufficient.

#### 4. A sequence with dependent actions

**Pregame:** Landfall payoffs should be in play before the lands intended to grow
them. A creature spell on the stack has not entered. **Strategy:** "Cast Hydra
with Forest A, Forest B and the Elves. After it resolves, play Forest C from hand,
then fetch with Passage. Preserve Forest C for Veil. Attack with the established
Chocobo after the growth resolves."
**Facts:** The named permanents are available, Elves can tap, the land play is
unused, and no known effect changes this sequence.

**First review:** "Is Hydra ready before either land use, with Forest C reserved
for protection after it enters?" The action question compares actual payments.
After casting, **next review:** "Hydra is on the stack. Its cast is recorded;
its entry is pending. Is a response required, or should priority be passed?"
The land step is waiting, not a missing legal action that requires a repair.

After Hydra enters with one counter, Jev chooses Forest C. Its landfall triggers
must be ordered and resolved; the observed result includes two Hydra counters. The
Passage activation then creates a search choice (example 6), and the fetched
land creates another trigger. Four counters are an expected result conditional
on those events, not a completion flag set when the sequence was planned.

**Changed case:** If Hydra is countered, the planned benefit of spending Passage
is gone. Use an explicitly prepared alternative or ask strategy about that loss.
Do not continue the sequence merely because later steps still have legal offers.

#### 5. Protect the named object in a response window

**Strategy:** "Use the reserved Forest and Veil to protect Hydra from targeted
removal. Do not spend that protection on unrelated damage."
**Facts:** Red's Shock is on top of the stack, bound to Green's 1/1 Hydra H.
Forest C is untapped; Veil is in Green's hand. Red may still have a response;
its hidden cards are not known.

**Review question:** "Does the protection response apply to Shock targeting
Hydra H? If Shock resolves on H now, two damage is lethal."
**Action question:** "Cast Veil targeting H with Forest C, choose another offered
response, or pass?" The candidate says which object it protects and which
reservation it spends. All Veil targets remain inspectable.

After the cast, the stack reads top first: Veil targeting H; Shock targeting H.
A subsequent response review shows protection pending, not protection already
granted. If Veil resolves, the next question reads the new counter and hexproof.
The remaining Shock is handled against its actual targets at resolution.
**Changed case:** Shock targets Green instead. That does not satisfy this branch;
Jev follows another covered response or passes, without recasting the whole plan.

#### 6. Resolve a search for its accepted purpose

**Pregame:** A fetch use must say what the searched land accomplishes. **Strategy:**
"Use Passage to add a Forest and get the second landfall on Hydra."
**Facts:** Continuing example 4, Passage was sacrificed as payment. Three Forests
remain on the battlefield. Its ability is resolving. A Forest is offered;
finding no card is also offered. No player has priority mid-search.

**Question:** "Which search choice carries out the accepted fetch? Choosing Forest
puts it onto the battlefield tapped, then shuffles. With these three lands still
present, it becomes the fourth and Passage untaps it. Finding nothing adds no
land and produces no landfall."
**Answer:** Choose Forest under this purpose. The cost is already paid and cannot
be undone by declining. Later instructions receive their bindings and remaining
obligations. Each continuation still needs a pick unless this seat explicitly
authorized its delegation. A new trigger waits until resolution finishes.

**Changed case:** No eligible land remains, or the seat intentionally prepared a
fail-to-find use. Declining remains a real choice. A missing binding must never
turn the purpose into an invented Forest or a mandatory search result.

#### 7. Order triggers by the resolution they should produce

**Strategy:** "Resolve Hydra's doubling before Chocobo's growth, to improve the
Hydra's toughness as soon as possible." **Facts:** A land entered with Hydra
at two counters and Chocobo present. Both landfall triggers are waiting under
Green's control. The stack resolves last in, first out.

**Question:** "Which waiting trigger should go onto the stack first so Hydra's
trigger will resolve first? Put Chocobo's trigger below Hydra's trigger."
The alternatives preview stack order and resulting resolution order explicitly.
After each pick, the next question shows the remaining triggers and current
order. It does not ask which should "go first" without naming the operation.

Both seats still receive priority before resolution. Hydra reaching four
counters is conditional on its trigger resolving with the relevant objects and
conditions intact. **Changed case:** A target must be bound, another controller
has waiting triggers, or Ascension produces a reflexive trigger after a counter
is added. Ask at the correct new obligation; do not select future targets or
interleave the controllers' ordering rounds by preference.

#### 8. Combat is a sequence of different questions

**Pregame:** Name which threat held blockers actually answer. **Strategy:** In
this constructed position, "Attack with both; holding these ground creatures
cannot stop Smaug's next attack."
**Facts:** Green is at 4, Red at 10. Green's attack-ready Chocobo is 9/10 with
trample until end of turn from Ascension; Hydra is 4/4 with trample. Red's sole
blocker is an untapped 4/3 Smaug with flying; Red has no Treasures. Green has no
flying or reach blocker. Current layers and marked damage are shown separately.

**Attack question:** "Which creature do you add to this declaration under the
attack-with-both plan? Chocobo and Hydra are eligible; neither can block Smaug
on the return attack." Jev selects each, then explicitly finishes attacking.
Show the whole developing declaration, not just the last selected creature.

The comparison is conditional: if Smaug blocks Hydra and nothing else changes,
Red takes 9 and Smaug dies; if Smaug blocks Chocobo, assigning 3 to Smaug and 6
to Red plus Hydra's 4 can be lethal. Smaug can block a ground attacker. Its flying
does not make it irrelevant to the attack calculation.

**Block variant:** Green faces Zhao and Kellan, with a 2/3 Chocobo and an Elf.
A plan to preserve the Elf and block Kellan asks "Block Kellan with Chocobo, add
another assignment, or finish?" Each pair names both creatures. A lone block on
Zhao conflicts with menace; a double block is a different complete declaration.

**Damage question:** "How should the blocked 9-power trampler assign its damage
under the face-damage plan?" Show all blockers, lethal requirements, marked
damage and the offered distributions. Keep assignment, simultaneous damage,
and later priority separate. **Changed case:** Removal, a pump, lost trample or
a first-strike step requires fresh facts and may invalidate the combat plan.

#### 9. Several modes, targets and payments

**Strategy:** "Use Abrade's damage mode on the opposing 3/3 Curator before it gains
its bonus. Preserve Mountain A for Shock and the Treasure for Smaug's attack."
**Facts:** Red has untapped Mountains A, B and C, Smaug and one Treasure; Abrade
and Shock are in hand. Green has Curator and Elves. Abrade's damage targets
include all three creatures; its artifact mode can target the Treasure. Payments
can consume different Mountains or the Treasure. The prepared payment is B and C.

The preferred sequence is: "Which prepared use applies now?" then "Which mode
and target carry out that use?" then "Which offered payment preserves Shock
and the Treasure's planned attack damage?"
Shared source text and effects appear once; alternatives state the changing
bindings and resources. The final question names the complete original move.
Skip a separate inspection question when it makes no further judgment possible;
still ask Jev to choose the voluntary move. A unique prepared line is not forced.

These are reversible inspections of the same decision. Selecting Abrade does
not cast it; selecting a target does not target anything in the game. Jev can
return to other uses. Every original choice remains reachable. Dependent target
slots, X and additional sacrifice/discard/exile costs must preserve the complete
relation among offers; separate menus must not fabricate a new combination.

**Changed case:** Curator is now 7/7. The original reason for Abrade no longer
holds. Ask about a covered alternative or revise the line before binding a
payment. Fitting the request cannot justify hiding that changed characteristic.

#### 10. Preparation, covered changes and a broken assumption

**Pregame:** Develop while preserving protection. **Background strategy:** With
three Forests expected next turn and Hydra, Chocobo and Veil in hand, prepare:
"If the draw supplies an available fourth untapped green source, play it, cast
Hydra and leave one Forest for Veil. Otherwise develop Chocobo and hold Veil."
It does not assume the next card is a Forest or inspect the library order.

After an actual Forest draw and unchanged board, the preparation can cover the
position. **Review question:** "The fourth-source branch applies. Is its land
use ready, with the later Hydra payment and Veil reservation still compatible?"
Drawing another Veil selects the prepared alternative; Jev does not invent one.
An uncovered change goes to the existing strategist at the appropriate stage.

**Broken case:** A different accepted plan has no smaller development branch.
An opponent's action removes a required resource. **Help request:** "The Hydra
line needs three spendable mana plus one
reserved green. Only three remain. No prepared alternative releases the hold.
Revise the unfinished line and its protection instruction. Nothing was cast."
The strategist returns coherent actions, guidance and holds. A refused submission
changes none of them. A pending effect is evidence to wait, not this kind of loss.

**Duplicate-use case:** Curator already has an activation on the stack targeting
Abrade to supply the fourth distinct card type in its linked exile. The review
states the binding, paid mana and pending result. It asks whether an interruption
requires a response, not whether to pay again to start the same use.

#### 11. Obligatory choices and cleanup

**Preparation:** The late-turn discard policy preserves the named response and
the next turn's sources. **Facts:** Green has nine cards and must discard two;
its hand contains three Forests, Chocobo, Curator, Hydra, Veil, Ascension and
Explorer. For this example the plan retains two Forests and the cheaper line.

**Question:** "Which card do you discard now? Two discards remain." The packet
shows the hand and resource commitments each candidate would leave. Under this
plan the third Forest and Explorer can leave. After one pick, recompute the
remaining hand and one-card obligation. Discard is a zone change, not an opening bottom choice.
Ordinary cleanup has no priority pass. If its state-based actions or triggers
open exceptional priority, both seats answer before another cleanup.

**Legend variant:** Two Smaugs under one controller require a choice of which
incarnation to keep. Show counters, damage, attachments, tapped state and the
plan's need for a blocker. Ask "Which Smaug do you keep for that purpose?" This
is not a priority response; one mandatory operation being automatic does not
make a genuine choice between permanents forced.

#### 12. Review completion and close the right window

**Strategy:** The main-phase line is complete when the named development has
resolved; Passage may be held for the opponent's end step; Veil remains reserved.
**Facts:** Land play recorded, creature resolved, stack empty, no remaining
instruction; Passage's hold and Veil's response are still applicable.

**Review question:** "Is any use still due in this main phase? Development is
complete; Passage is held for the named later window, and Veil is a response."
A held card is accounted for, not forgotten and not required to be spent now.
**Final question:** "Pass priority with this work reviewed, or inspect another
use? If Red also passes without acting, precombat main ends."

Reviewing completion does not pass. Red answers separately. If Red acts, Jev
receives the new response situation and later reviews completion against the
changed facts. **Changed case:** The creature is still on the stack, or a search
is unanswered. Announcement is not completion; the next question concerns that
pending work and cannot claim that the phase is over.

### Phase and stage coverage

The same examples serve both seats, with each seat's own knowledge and intent.
For every row, review entry obligations, interruptions, repeated decisions and
exit conditions. Skipped or inserted steps use the actual window, not an assumed
position in a fixed turn script.

| Window | Active seat | Other seat | Question classes and examples |
|---|---|---|---|
| Deck registration and card assessment | Both seats prepare before dealing; reject missing card meaning | Public lists, private equipment | Preparation contract; restricted payment in 3 and continuation in 6 |
| Pregame analysis and synthesis | Both seats prepare policies, sequences, threats and exceptions | No hidden hands or order inferred | Apply policy, sequence and response; 2, 4, 5, 8, 10 |
| Opening | Declare keep/mulligan, then satisfy own bottom obligations | Answer own obligations in the table's order | Apply policy; 2. Card-granted opening actions remain unsupported |
| Untap | Automatic applicable rules operations | No ordinary priority | Show resulting facts to the next question, not an invented consent call |
| Upkeep | Handle triggers, then own uses and priority | Review responses and last pre-draw opportunities | Order, response, pass; 1, 5, 7 |
| Draw | Draw when required; accept or amend preparation afterward | Respond only in actual priority windows | Covered change, response; 5, 10. Respect the starting player's skipped first draw |
| Precombat main | Develop, pay, sequence, finish | Respond to each action when priority reaches it | Review, bind, sequence, resolve, close; 3-7, 9, 12 |
| Begin combat | Apply planned last pre-attack actions | Apply pre-attack responses | Review timing and response; 5, 8. A later attack declaration is not already made |
| Declare attackers | Choose attackers and finish, then handle attack triggers and priority | Receive priority after declarations and triggers as appropriate | Combat, order, response; 5, 7, 8 |
| Declare blockers | Respond after the defender's declaration | Choose blocks and finish; own later responses | Combat and response; 5, 8 |
| Combat damage, including extra step | Make required assignments; simultaneous damage then checkpoints | Make own required assignments and later responses | Damage and order; 7, 8. No priority between assignment and dealing |
| End combat | Remaining combat effects and last combat uses | Own responses | Resolve, respond, finish; 5, 6, 12 |
| Postcombat main | Reconcile actual combat results; develop with remaining resources | Own responses | Sequence, changed assumptions, finish; 3, 4, 10, 12 |
| End step | End triggers, delayed effects and final priority | Held end-step uses such as a fetch | Order, response, resolve, finish; 5-7, 12 |
| Cleanup | Repeated required discards, expiry, state-based actions | No ordinary priority; answer exceptional priority | Obligations and response; 11. Repeat cleanup after the exception |
| Any priority checkpoint | State-based choices and waiting triggers precede priority | Answer the controller's actual obligation | Order, obligatory choice; 7, 11 |
| Mid-resolution | The instruction's assigned seat answers | No ordinary priority; may be assigned an instruction | Resolve; 6. `may`, `unless`, bindings and target changes need distinct examples |
| Rewind, clone or resume | Rebuild the same pending question from recorded facts and accepted work | Each seat reads its own projection again | Revise or clarify; 10. Discard stale inspections, not historical decisions |

| Planning stage or situation | Required preparation or question | What follows |
|---|---|---|
| Initial brief | Opening policy and first upkeep directions before the first draw | Jev applies them without an extra opening strategy session |
| Opponent-turn preparation | Current projected position, next-turn resource assumptions, unknown draw and opponent changes | A conditional candidate plan; no action and no invented future facts |
| After own draw | Actual draw and changes since preparation; which branch covers them? | Adopt if covered and valid, otherwise amend with the same planner |
| Due use | Applicable policy, prerequisite facts, concrete choices and resource commitments | Review, inspect if needed, then an original move id |
| Several applicable branches | Prepared precedence and conditions releasing holds | Apply that precedence; unresolved strategic conflicts go to the writer |
| Ordinary wait | Name the pending effect and the use it blocks | Answer the current response or resolution question; no repair just for waiting |
| Uncovered event or lost assumption | Changed fact, affected uses, remaining resources and earlier recorded work | Revise the unfinished line, its guidance and commitments together |
| Rejected submission | Each validation problem; unchanged physical position and accepted plan | Correct the proposed plan, never pretend it executed |
| Rule uncertainty | The actual timing or rules question and affected facts | A cited lookup without motion, then the same decision |
| Suspected opponent violation | A recorded opponent action, claimed conflict and relevant public facts | Strategy raises an objection; the judge decides, with replanning after rollback |
| New phase with the same line | The new window and the preparation applicable there | Jev's next question; no strategy session solely for the phase change |
| Clone, resume or ruling | Recorded preparation and progress for that prefix | Rebuild the pending question; discard inspections bound to a different frame |

A rule lookup is not a replan, a replan is not a physical move, and disagreement
with guidance is not automatically an objection. Capacity failure is an
infrastructure outcome, not a request by the seat to change its strategy.

### Review the examples before building

This first set covers the principal chains. The remaining variants belong to
these same classes. Work each into a concrete position before its builder or
planner direction is considered covered:

| Variation to develop | Preferred question | Preparation and facts required |
|---|---|---|
| Dependent target slots | "Which second target belongs to this first target and accepted mode?" | The relationship and complete valid bindings, not two independent target lists |
| X and additional costs | "Which offered X and payment achieves the named use while retaining its commitments?" | Strategy's chosen purpose; actual mana, sacrificed/discarded/exiled objects and consequences |
| Optional or `unless` choice | "Take this instruction's option, pay its stated cost, or decline under the prepared policy?" | The exact current instruction, actor, costs already paid and remaining alternatives |
| Explicit delegation | "Does this remaining instruction match the continuation this seat authorized?" | Authorization scope and a unique matching continuation; a broad goal is not authorization |
| Intervening condition or reflexive trigger | "Which current obligation exists after this event and condition check?" | Engine-derived waiting work and fresh conditions; no speculative future target selection |
| First or double strike | "Which assignment carries out the plan in this damage step?" | Eligible participants, previous-step results and damage still to come |
| Temporary permission | "Use this available card before permission expires, or follow the prepared hold?" | The permitted zone, timing, expiry and remaining resources; expiry creates no automatic cast |
| Control change or re-entry | "Does the prepared use still refer to this object and controller?" | Incarnation, ownership/control, applicable registrations and changed availability |

Mark unsupported mechanics separately, such as ordering overlapping replacements,
rather than advertise a usable question. Deriving waiting work or matching an
explicit delegation can require no Jev call; do not turn every explanatory
question in this table into an inference request.

For each example, review these points in order:

1. **Gameplay.** Are the position, timing, costs and conditional outcomes correct
   against the pinned card data and rules? Does the example distinguish an
   accepted interpretation from proof of legality?
2. **Preparation.** Did pregame settle the reusable policy? Did strategy resolve
   the live tradeoff and name when the choice reverses? No unexplained "best"
   target or "good" payment may reach Jev as its strategic task.
3. **Question.** Is one judgment being asked with the facts needed for it?
   Would the changed-position case lead to a different supported answer?
4. **Continuation.** Does the answer change only what it claims? Are next
   obligations, pending work, both seats' priority and completion evidence clear?
5. **Information and choice.** No hidden facts; every offered move remains
   reachable; known restrictions accompany the choice they affect. A model's
   preference never silently removes the other moves.

Then group the reviewed examples into shared content builders and choose the
smallest preparation vocabulary that serves them. Adapt the pregame analyst and
synthesis instructions, strategy submission guidance and example lookup together.
Give each role the examples it must produce or consume. Load complete relevant
examples on demand; do not paste the whole catalogue into every prompt. Keep
current syntax examples distinct from proposed interfaces until handlers exist.

### Implementation and validation after the design review

Build in this order: representative question fixtures; the missing projected
facts and accepted intent they require; preparation and planner instructions;
focused question builders and pure inspection; then trace diagnostics and
capacity handling across the whole request. Derive game facts in core, select
and render them in context. Keep the physical offer list intact. Delete replaced
construction paths. Do not add a framework or ports around local functions.

For a large decision, first identify the dimensions the seat actually compares.
Share common source text and effects; inspect a use, its targets and its payment
when those are separate judgments. Preserve dependent combinations, backtracking
and a final choice of an original move id, even if only one remains. Bind all
inspection to the decision and physical/equipment revisions. No intermediate
selection pays a cost, declares a target or advances the table.

Measure the complete request: instructions, state, criteria, requested output
ceiling, fact provenance, repeated components and actual provider usage. Use
Pi's resolved capabilities and provider contract for capacity checks; name any
tokenizer or estimator and its limits. JSON bytes are not tokens. If a complete
question still cannot be submitted, record an infrastructure failure and leave
that exact decision pending. Do not retry an unchanged oversized request until
it turns into a fallback pass. Keep malformed-answer accounting distinct.

No string clipping, partial card text, first-N options, silent omission or
stronger-model substitution. Replace existing fixed history/step slices only
after the examples establish what that question needs. Necessary facts must be
present at the final choice, not merely available behind an optional lookup.
More focused Jev calls are useful when each settles a real part of the decision;
neither a low call count nor a small packet proves good context.

Only now use the three games to challenge the design. Their 3,190 Jev requests
include 1,886 reviews; card reviews averaged 10.4 printed card texts, and one
unavailable-step review carried 35 move options with none matching the step.
The largest failed retry was 88,548 serialized bytes. Those observations locate
regressions; they do not say which content the preferred question requires.
The audit is under `.pi/jev-context-review-20261005/`; seven saved cases under
`.pi/luna-three-low-20261005/positions/index.json` cover payment, search, pending
Curator use, stale guidance, bottoming, combat and provider refusal. Village's
assessment needs model-authored correction before its example can run faithfully.

Extend existing invariant tests for sufficiency, relevant changes, no leakage,
choice reachability, dependent payments, stale inspection, replay and resume.
Use doubles to test question construction and transitions, not to assert that a
real model will make the expected judgment. Each commit passes `npm test` and
`npm run check`. After offline coverage, probe the worked cases with the fixed
live roster, then bounded continuations and an ordinary opening. Full games
follow coherent component behavior; no new full game is needed to design these
questions.
