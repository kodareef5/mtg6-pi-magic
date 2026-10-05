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

This is the October 5 implementation plan, not a description of work already
shipped. Keep Jev as pilot, Luna low for strategy, judge and summary, and Sol
6.1 high for pregame. The three games in `docs/STANDARD.md` supply the failures.
This round changes how a decision is prepared and inspected. It does not widen
formats, replace the planner, or teach core to interpret Oracle text.

### What the audit found

The audit classified all 3,190 Jev requests from the three runs, including 1,886
reviews. These are serialized request bytes, not token estimates:

| Question | Calls | Median bytes | Largest request |
|---|---:|---:|---:|
| Card review | 767 | 15,098 | 54,513 |
| Phase review | 605 | 11,147 | 84,628 |
| Step review | 231 | 11,188 | 55,854 |
| Response review | 204 | 12,065 | 39,589 |
| Branch review | 79 | 14,385 | 36,580 |
| Priority pick | 1,039 | 11,672 | 88,548 |
| Resolution | 140 | 11,399 | 20,326 |
| Attack | 70 | 11,272 | 19,409 |
| Block | 21 | 11,555 | 24,424 |
| Trigger order | 22 | 17,802 | 23,962 |
| Keep or mulligan | 9 | 6,015 | 6,751 |
| Opening bottom | 3 | 7,784 | 8,942 |

`seat.ts` builds the whole packet before selecting the review question, then
sends that same packet for a card review, a response review or a move. Card
reviews averaged 10.4 printed card texts. One unavailable-step review carried
35 options, none for that step. Phase reviews repeat option descriptions in
instructions; move questions repeat them in classifier criteria. This is
broader than the failing 88 KB request. The preceding 84.6 KB phase review
succeeded and reported 30,996 input tokens, so byte counts alone do not identify
the provider's token limit.

Useful structure is lost before Jev reads it. `announce.ts` has a source,
targets, costs and payments, but `Option` exposes mostly `label` and `shows`.
`packet.ts` removes object incarnation, stack position, target bindings and
structured combat assignments. It carries every battlefield and stack card's
text, all active watches and the full checklist. Resolution repeats instructions
in several forms but inherits only the plan's broad objective. The current size
test checks one small position against 12,000 characters; it does not exercise
the growth seen in these games.

Private audit data is in `.pi/jev-context-review-20261005/profile.json` and
`requests.json`. Exact failures and replay-checked prefixes remain in
`.pi/luna-three-low-20261005/positions/index.json`.

### Build the question before its context

Keep one small dispatcher and shared fact readers, with builders grouped by
the decisions they serve. Each builder declares its question, required facts,
guidance source and possible answers. Select by typed decision, window, review
item and instruction cursor, never by parsing labels or option ids.

| Builder | What it must establish |
|---|---|
| Keep or mulligan | Current hand, mana sources, named opening policy, mulligans and retained hand size. |
| Bottom or discard | Remaining obligation, cards already selected, and the hand and resource counts each candidate would leave. |
| Phase, step, branch or card review | The named item, its real action, conditions, availability reasons, held resources and recorded progress. A phase review compares uses without enumerating every payment. |
| Response and priority | Ordered stack with named targets, relevant responses, what is already pending, and the consequence of this seat's pass. Empty-stack development has its own focus. |
| Attack, block or assign damage | Current declarations by object incarnation, defenders, characteristics, marked damage, conflicts, named offensive and defensive commitments, and conditional damage arithmetic. |
| Trigger order and targets | Waiting triggers, controller, cause, source, target dependencies and what will resolve first. |
| Resolve an instruction | The accepted use, paid costs, originating intent, current instruction, locked targets, earlier bindings, remaining choices and what declining would leave undone. |
| Other rules choices | The actual obligation and affected objects, including replacement order, legend choices and repeated cleanup. Unsupported decision kinds must be reported. |

Each includes only the dependencies of that question: the relevant sources,
candidate targets, payment sources, attachments, restrictions, permissions and
registered effects that can alter them. Follow those relationships through the
projected view. A global effect may require a broad set; a builder must explain
that inclusion rather than assume other permanents irrelevant. Unresolved
dependencies are a reason to inspect more, not evidence that no restriction
exists. Keep full printed text for the cards the question needs, once per card.

Derive game facts in core where a human seat would want them too. Context selects
and renders those facts; it does not read the unprojected table or raw move
changes. Record why a fact was included in diagnostic output outside the model
request. Do not add a generic retrieval framework or ports around local readers.

Separate facts from authored intent. Name the writer and applicable window of
guidance. Render the concrete action from its structured terms instead of using
a free-form step label as its description. A review judgment, an announcement,
a pending effect and a completed effect are different facts. Read progress from
the ledger, stack and resolution cursor, including across plan replacement;
do not create a second stored completion flag. An unplanned action in an earlier
window is still visible history, not automatic completion of a later plan step.

### Represent choices without repeating their whole descriptions

Expose projected structured option facts where core builds the offer. Preserve
source incarnation, use or mode, X, target slots and bindings, every cost,
payment sources, remaining resources, conflicts and plan marks. Additional
costs must name the sacrificed, discarded or exiled objects, including held
resources they consume. Never reconstruct these facts by decoding an id or
parsing `shows`. Never expose hidden execution changes through this metadata.

Share the common source, accepted effect and printed text across variants;
each variant supplies its actual targets and payment. Render each fact once.
Use one request builder for both state and criteria so their descriptions
cannot silently diverge or duplicate one another.

When choices have several dimensions, let Jev inspect a use, then its modes,
targets and payment. Keep the relation among complete offered choices: selecting
a target must expose only payments belonging to a real original option, rather
than inventing combinations from independent lists. Let Jev return to another
use or inspect why one is unavailable. Compare relevant costs and consequences
before narrowing, including resources held for a different use.

Intermediate selections move nothing and pay nothing. The final move question
chooses an original offered id, even when only one remains. The core's offered
menu stays intact. Every original option must be reachable, and pass and help
remain available in their proper windows. Bind inspection to the physical
revision, equipment revision and decision; discard it on a changed frame or
rollback. Independent questions may share a call, but an answer cannot depend
on a sibling answer in that call.

### Handle size before dispatch

Measure the complete request, including question instructions and criteria.
Record its builder, stage, frame, plan revision, fact counts, option dimensions,
largest contributors, requested output ceiling and actual provider token usage
when returned. Keep those diagnostics beside the private trace, with counts
reported separately for reviews, inspection and final picks.

Use Pi's resolved model capabilities and provider request contract for capacity
checks. An exact tokenizer or provider estimator must be identified as such;
JSON bytes and a guessed characters-per-token ratio are not a guarantee.
Missing or conflicting capacity information is an explicit diagnostic to
resolve against saved requests. Do not invent a token limit from one failure.

Ordinary construction should already share repeated facts and separate decision
dimensions. If a complete question is still too large, inspect why and use the
appropriate smaller question or explicit fact lookup. Every original choice
must remain reachable. The final question must carry the facts needed to choose
that action; a known restriction cannot be left behind an optional lookup.
If no complete representation can be submitted, record a typed capacity failure
and leave this exact decision pending for resume. Core needs a generic way to
represent an unavailable player, without importing a model or provider.
This changes the current capacity-error path,
which retries the same oversized question and eventually applies a fallback
pass. Keep malformed-answer retry and fallback accounting distinct.

No string clipping, partial Oracle paragraphs, first-N options, shortest-option
sampling, silent fact dropping or stronger-model substitution. An inspection
budget exhausted by repeated navigation also leaves the decision pending; it
does not authorize a pass. Audit the existing next-two-step and last-three-recap
slices against the question's dependencies rather than replacing them with new
numeric cutoffs. Current state and relevant event history must be sufficient
without recaps. Do not change review expiry merely to lower call counts.

### Build order and acceptance

1. **Make the audit repeatable.** Extend trace/statistics support to report the
   complete request by decision kind and component. Retain normal and failing
   examples from all three games. Fill missing coverage with existing registered
   deck fixtures for cleanup, legend choices, damage assignment and rule lookup;
   these were not all exercised by the live batch.
2. **Preserve structured facts.** Change `core/types.ts`, offer builders and
   `core/view.ts` to expose safe option details, ordered stack bindings, combat
   declarations and action history. Extend no-leak, replay, resolution and
   payment invariants. Reassess Village's faulty spending restriction through
   model-authored preparation and test its accepted terms separately.
3. **Replace the shared packet by task.** Refactor `context/packet.ts`,
   `review.ts` and the question construction in `seat.ts`. Start with response
   and resolution, then reviews, priority, combat and opening choices. Preserve
   original ids and mandatory facts while removing duplicated renderings.
   Replace the single small-position size assertion with sufficiency, relevance
   and growth checks. Delete the superseded construction paths.
4. **Add complete inspection and capacity handling.** Extend the existing
   navigation loop and generic player failure path. Test reachability of every
   original option, dependent targets and payments, backtracking, stale frames,
   retry, capacity failure without motion, resume and exact final application.
   Every additional Jev request belongs in the bill; no new inference role is
   needed. Direct small decisions retain a direct path.
5. **Repair the guidance feeding those questions.** Preserve an accepted use's
   purpose through resolution, including fetch searches. Amend affected phase
   guidance with changed actions instead of carrying stale prose. Simplify
   Luna's ordinary action references and condition input using the 128 recorded
   submission-repair calls. Keep complex card terms in pregame preparation.
   Test retained-hand choices and combat commitments against their named
   resource and threat facts. Core must not decide what the seat should keep,
   fetch or attack with.

Each commit passes `npm test` and `npm run check`. Extend the existing invariant
tests rather than adding a test per card. Compare packets from the same saved
decision before and after a change. Required facts and option reachability
must pass independently of whether Jev makes a good choice; smaller requests
alone do not pass. Adding irrelevant facts must not inflate a focused question,
while adding a relevant global restriction must bring that restriction in.

After offline checks, make isolated live Jev probes at the saved failures,
including successful comparison searches and ordinary passes. Check the actual
choice, request size, calls, latency, help requests and provider refusals. Then
resume a bounded continuation from before game two's failure and inspect one
ordinary opening with corrected preparation. Full games wait until those
checks show complete context and coherent execution. No new full games are
needed to discover the already-recorded defects again.
