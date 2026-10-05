# Plans

The pregame settles the matchup. Strategy advances that reasoning as the position
changes. Jev flies the ordered actions and the guidance for the current phase.
Core accepts a complete `PlanSchema` plan; the strategist can write a short update.

## The planning loop

1. **Setup.** Four pregame analysts study resources, the matchup, opening hands
   and likely mistakes. A synthesis writes the brief. Its step decisions become
   the initial phase scripts, and its short objective supplies Jev's strategy
   line. The brief also supplies the mulligan and upkeep
   guidance, so there is no extra opening strategy session before the draw.
2. **Think ahead.** At the start of the opponent's turn, one strategy session
   prepares the seat's next turn from its projected position, brief and accepted
   work. It writes the ordered line, mana commitments, phase decisions and
   responses. The next draw remains unknown; conditional branches cover draws
   that change the line. It does not change the table.
3. **After the draw.** Use the preparation directly when the position is quiet,
   the plan passes its checks and a live step or branch covers the draw. Otherwise
   the same planner amends it for the changes and the revealed draw. If preparation
   is still running, wait for that job. If it failed, plan from the current frame.
4. **Fly the turn.** Jev takes the steps and standing responses. A phase change
   spends no strategy call. A stop or a request for help uses the same planner to
   change the unfinished line.

There is one planner per seat. A stop, replaced plan, rewind or seat closure
cancels stale preparation. Its notes and plan are discarded together. A clone
carries accepted work, never an in-flight job. Closing a run waits for cancellation
before reporting its bill.

No challenger, note-taking session, timeout race or delayed note merge sits beside
this loop. The pregame challenge remains part of setup.

## Short answers, complete plans

The writer's `submit` tool takes `changes`, optional `notes`, and an optional
`objection`. Omitted plan fields keep the supplied `base`; lists replace their
whole lists, and `[]` clears one. `changes: {}` keeps the base.
Packages join by card name instead: a new package must not drop a package still
waiting in preparation, and an empty package list does not remove accepted work.

For a new turn, the base keeps strategic and phase defaults but clears the ordered
steps. For a midturn amendment, it removes completed steps. Packages already in
private work need no repetition. Existing bounded response and phase windows are
shifted to the next pair of turns; the writer sees that base before updating it.
Prefer `active` and `step` to unnecessary absolute turn numbers.

The writer also receives `actions`: its current steps, branches and earlier
executed actions, each with a key, label and full syntax. A new step may use
`"action": {"reuse": "worked:0"}`. That copies the exact action, including its
selectors, targets and costs. A changed action must be written again. These are
seat-authored terms, not card programs or an automatically offered repertoire.

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
| `packages` | New or corrected entry registrations; they persist in private work. |

`docs/examples/turn-plan.md` shows a complete plan. The writer always receives
`docs/SYNTAX.md` and the real schema. The `example` tool reads worked examples
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
resources and stops. A unique fitting continuation is delegated. When the plan
settles nothing at priority, it delegates a pass; attacks, blocks, trigger targets
and resolution choices use their existing handlers. Every physical option remains
available, marked and ordered for Jev rather than hidden.

An essential step that cannot be taken where it belongs asks for another plan,
within the escalation budget. A resolving spell is allowed to finish first.
If the stop is spent and the table passes it, the gap records that failed line.
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

In a scripted phase Jev sees the objective, that phase's decisions and ordered
steps, applicable branches, holds, options and projected facts. It sees no
notebook or whole card procedures. Outside a script, the brief's matching notes
and recent recaps remain available. `ask:help` covers a named unexpected event or
a plan that cannot be carried out; it is not permission to improvise strategy.

`planned` records the actual decision-boundary wait, readiness, result and failed
sessions. `tools/stats.ts` separates prepared, amended, written and escalation
plans. Call durations and cancelled preparations remain in the bill; overlapping
background time is not the same as time waiting for a turn plan.

The next live check is one short monitored run: inspect each plan's output,
corrections, strategy wait, Jev decisions and legality before extending it.
Offline checks establish the mechanics, not a twelve-second response time or
expert playing strength.
