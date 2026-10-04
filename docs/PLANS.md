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
| `packages` | What each permanent registers as it enters. They join the seat's packages and outlive the plan. |

The plan is accepted whole with `plan.put`, or refused whole with every problem
named. It moves nothing.

## How the table flies it

`src/core/planning.ts` reads the seat's frame: which steps are due (window open,
`if` holds, not yet taken), which listed options fit each, which branches apply,
which stops hold, which resources are held. `src/core/loop.ts` acts on it at each
of that seat's decisions, in this order:

1. **Strategy is wanted.** A request, or the seat's own turn has begun and it
   has drawn. Strategy writes the next plan.
2. **A stop.** An `askWhen` holds, or the next step's own step window is open
   with nothing that fits it and an empty stack. The table requests a new plan,
   once per stop per turn, at most two requests a turn.
3. **Forced.** One option, as always. A forced move that is a plan step is
   recorded as that step.
4. **Settled.** No step or branch fits anything listed: at priority the table
   passes; declaring our own attackers it attacks with nothing. The first due step
   has exactly one fitting option and no branch applies: the table takes it.
   Both are recorded as `delegated`.
5. **Asked.** Otherwise the pilot is asked. Its options carry the plan's marks:
   "Plan step", "Plan branch", "Uses X, held: why". Nothing is removed. It may
   choose `ask:help`, which requests a new plan within the same budget.

Blocks, resolution choices and trigger order with a real choice are never
defaulted; the pilot reads the plan and chooses.

## Progress

Each action that carries out a step or branch writes `execution: {plan, step}`
or `{plan, branch}` on its ledger row, where `plan` is the equipment revision
that accepted the plan. A seat's progress is read from those rows (`view.done`),
so it cannot tear, replay needs nothing new, and a clone holds exactly the
progress of its prefix.

## What the pilot reads

`src/context/packet.ts`: the obligation; the plan's objective, the due step, the
next two, live branches, holds and stops; the marked options; the public
position with compact objects; this window's brief note and notes for cards the
options name; the last recaps. Not the deck lists, not card registrations, not
analysis the plan already settled.

## What it does not promise

A plan is a seat's preference. Accepting it proves neither card meaning nor
strategic quality, and following it does not make a move legal. A step the
table takes for the seat is still that seat's action, open to objection.
