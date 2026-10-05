# Plans

A seat plays by a plan. Strategy writes it; the pilot (jev, a classifier) flies
it; the table takes what the plan already settles. The shape is `PlanSchema` in
`src/core/language.ts`, and `docs/examples/turn-plan.md` is a whole one.

## What a plan holds

| Field | What it is |
|---|---|
| `objective` | The role, the route to a win, and what changes it. |
| `guidance` | The chosen line, and why the main alternative loses. |
| `steps` | The line, in the order the table will ask. Each is a window (`when`), an optional `if`, and an action: a listed option by id or prefix and objects, or a procedure to announce. |
| `may` | Standing branches: a response, a block, another way if the first is unavailable. Taken when their window and `if` hold. |
| `askWhen` | Visible facts that mean the plan no longer fits. |
| `holds` | Resources kept for a purpose, and what releases them. |
| `phases` | The pilot's script, window by window: a `goal`, the decisions in `guidance`, and in `reevaluate` the few situations worth asking strategy again. The pilot reads the entries that match now. |
| `packages` | What each permanent registers as it enters. They join the seat's packages and outlive the plan. |

The plan is accepted whole with `plan.put`, or refused whole with every problem
named. It moves nothing.

## The notebook

Beside the plan, the strategist keeps its own notes by topic, about 50k tokens of
room (`NOTEBOOK_LIMIT`), each topic stamped with the turn it was last revised
(`Workspace.notebook`). They hold what the opponent has shown and may hold,
threats, our engine, what to watch, what was learned, sequences and syntax worth
reusing. Every writer call reads them first and builds on them rather than
working the position out again. The pilot never sees them.

The writer edits them with a `note` tool, a topic at a time, as often as it
needs within its session; the edits go to the table with its answer as
`notebook.edit` and merge into the notebook as it then stands. So the sessions
that work for one seat at once share it, each keeping its own part:

| Session | Its part |
|---|---|
| Preparation | The analysis: opponent, threats, engine, lessons, the next turn's line. |
| Challenger | `challenge of turn N`: what it found, and what the revision fixed or rejected. |
| Review | `turn N review`: what changed and what it touched; retires a challenge dealt with. |
| A stop or help | What fired and what changed. |

Past about 40k tokens the preparation is asked to compact it; an edit past the
limit is refused. It is private equipment, so it is journaled, replayed and
cloned.

## How the table flies it

`src/core/planning.ts` reads the seat's frame: which steps are due (window open,
`if` holds, not yet taken), which listed options fit each, which branches apply,
which stops hold, which resources are held. `src/core/loop.ts` acts on it at each
of that seat's decisions, in this order:

1. **Strategy is wanted.** A request, or the seat's own turn has begun and it
   has drawn. Strategy writes the next plan.
2. **A stop.** An `askWhen` has become true. The table requests a new plan,
   once per stop per turn, at most two requests a turn. A step that cannot be
   taken now is passed over rather than a stop: many steps are "if able". A
   step marked `essential` is the exception: where it belongs (its own step, or
   a main phase) with an empty stack and nothing listed carries it out, it is a
   stop. While a spell waits to resolve, passing is the procedure, not a stop.
3. **Forced.** One option, as always. A forced move that is a plan step is
   recorded as that step. A pass forced past an essential step whose stop was
   already spent is recorded as a gap, and play goes on.
4. **Settled.** No step or branch fits anything listed: at priority the table
   passes; declaring our own attackers it attacks with nothing. The first due step
   with a fitting option has exactly one and no branch applies: the table takes it.
   Both are recorded as `delegated`.
5. **Asked.** Otherwise the pilot is asked. Its options carry the plan's marks:
   "Plan step", "Plan branch", "Uses X, held: why". Nothing is removed. It may
   choose `ask:help`, which requests a new plan within the same budget.

Blocks, resolution choices and trigger order with a real choice are never
defaulted; the pilot reads the plan and chooses.

## Preparing the next turn at once

As soon as a seat's own turn plan goes in, the seat starts preparing its next
own turn in the background (`strategy.prepareTurn`), from the position with
that plan and its notes in place. If none is running when the opponent's turn
begins, one starts then. The request asks for more than a turn plan, because
there is time:
- the notebook first: what is new, revised, retired, learned;
- the next turn window by window as phase scripts, with the mana for each spell
  and holds for responses;
- branches for the draws that would change the line;
- essential steps marked;
- the opponent's following turn.

Nothing is accepted then. When the seat's own turn begins and it has drawn, the
prepared plan is offered:
- as it is, with no call, when nothing changed but the draw, the plan still
  passes every check and the arithmetic, and a step or a branch whose
  condition holds takes the drawn card;
- otherwise after a short review (`strategy.reviewPlan`), which keeps it with
  `{accept: true}` or revises it.

Every writer session can look up cards and rules (`card`, `rule`), reads
`view.worked` (the steps it carried out earlier this game, with their syntax,
to reuse) and is told whose turns are whose by number. A stop or a request for
help with notes in place is answered as maintenance: change what it touches,
keep the rest, and note what happened.

"Changed" is read from the permanents themselves, not only which ones there
are: counters, characteristics, registrations, attachments, the opponent's
tapped permanents, the table's notes, life, and a plan accepted in between (a
stop, a request for help, a judge's rollback). Our own untap is expected.

Once the preparation passes the code's checks, a challenger
(`strategy.challengePlan`) looks for what code cannot see: a trigger expected
before its source enters, guidance the steps contradict, a missed lethal, the
opponent's best reply uncovered. Its errors reach the seat as soon as they are
found and get one revision, used only if it is ready when the turn begins.
Errors with no finished revision go to the review; they never let the plan
through as it is.

A preparation still running when the turn begins gets a short grace (20 s,
about what writing the plan anew costs); past it, the turn is planned without
it, and its notebook edits go in with the seat's next answer when it finishes.

A preparation belongs to the seat while it is the current one: once it is
taken, replaced or the seat closes, it starts no further call and is never
used. A failed preparation leaves the ordinary turn plan. The plan goes through
`plan.put` as always, so the journal and replay are unchanged.

## The arithmetic

`src/core/budget.ts` walks the seat's next own turn: land plays, each step's
card taken once, costs paid from what the steps before leave and the plan does
not hold, floating mana gone once a step is in a later window, branches on the
opponent's turn paid from what is left. Every different payment is tried before
a conflict is named; a search too large to finish names none. It is a forecast:
the writer is told once a session, and a writer that disagrees is let through.
The table does not run it when it accepts a plan; the payment at the time
decides.

## Progress

Each action that carries out a step or branch writes `execution: {plan, step}`
or `{plan, branch}` on its ledger row, where `plan` is the equipment revision
that accepted the plan. A seat's progress is read from those rows (`view.done`),
so it cannot tear, replay needs nothing new, and a clone holds exactly the
progress of its prefix.

## What the pilot reads

`src/context/packet.ts`. In a window with a phase script, the pilot reads:
- the plan's objective, as the general strategy;
- the script: its goal, its decisions, this window's steps in order (done, now,
  then), the live branches and holds;
- what would justify asking again;
- the marked options;
- the public position with compact objects.

It is offered `ask:help` only for what the script's `reevaluate` names, or when
nothing listed can carry out the phase. Anything else is normal play. A
well-scripted phase is flown without a planning call, and `npm run stats`
counts every interruption.

In a window without a script, it reads the whole plan's guidance, the due step
and the next two, this window's brief note, notes for cards the options name,
and the last recaps.

It never sees the deck lists, card registrations, the notebook, or analysis the
plan already settled.

## What it does not promise

A plan is a seat's preference. Accepting it proves neither card meaning nor
strategic quality, and following it does not make a move legal. A step the
table takes for the seat is still that seat's action, open to objection.
