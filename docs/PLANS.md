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

The writer also receives `actions`: prepared card procedures, its current steps,
branches and earlier executed actions, each with a key, label and full syntax.
A new step may use `"action": {"reuse": "prepared:0"}` or `"worked:0"`.
That copies the exact action, including its
selectors, targets and costs. A changed action must be written again. These are
seat-authored terms. Core offers assessed procedures whenever their timing,
sources, targets and resources fit. A turn plan chooses a line from that repertoire.

`src/context/plan-edit.ts` merges the answer and expands reuse keys. The result
goes through the ordinary atomic `plan.put` writer. Core and the journal hold
complete terms, so replay needs neither the model nor the update vocabulary.
Reusing accepted syntax does not certify its interpretation.

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

`docs/examples/turn-plan.md` shows a complete plan. The writer always receives
`docs/SYNTAX.md` and the real schema as prompt text. The advertised tool schema
stays shallow: provider expansion of recursive definitions made a measured
strategy request exceed 430,000 input tokens. Exact local validation still checks
every nested term. The `example` tool reads worked examples
when needed, instead of resending every example in every session. Card, rule and
odds lookups remain available. A session has up to three replies for a needed
lookup and correction, rather than eight rounds of notebook work.

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
