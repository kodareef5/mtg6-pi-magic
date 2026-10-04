# When jev asks, and when it objects

Jev flies the plan. It does not work out a new line when the plan stops fitting.
It asks, and strategy writes the next plan. Asking costs one strategy call;
improvising costs the game. Tell jev when to ask.

`askWhen` lists visible facts, written as conditions, that mean the plan no
longer fits. The table checks them and offers jev the ask. Good ones are about
the position, not about how jev feels:

- the creature the plan protects is gone;
- the opponent has more untapped mana than the plan assumed;
- a card the plan relies on was countered, discarded or exiled;
- the opponent has a blocker the plan did not expect.

The table also raises two asks itself, with no jev call:

- **Unavailable.** The due step has nothing to pick: its card is gone or its
  window has passed.
- **Refused.** The step was offered but could not be paid or targeted.

Jev can always raise three more: the options are bad, something unexpected
happened, or it needs help with one decision.

```json plan
{
  "objective": "Race: Green's life to zero before Hydra takes over.",
  "guidance": "Attack with everything every turn. Burn blockers only when that lets two or more damage through; otherwise burn face at Green's end step.",
  "steps": [],
  "may": [],
  "askWhen": [
    { "label": "Green gained life this turn", "if": { "amount": { "history": "life-gained", "by": "opponent" }, "atLeast": 1 } },
    { "label": "A Green creature has five or more power", "if": { "amount": { "count": { "types": ["creature"], "controller": "opponent", "power": { "atLeast": 5 } } }, "atLeast": 1 } },
    { "label": "Red is at six life or less", "if": { "amount": { "life": "you" }, "atMost": 6 } }
  ],
  "packages": []
}
```

Every `askWhen` must be a fact the syntax can test. If you cannot write one as a
condition, put it in the guidance as prose, and jev raises "something
unexpected" when it sees it.

## Objecting

Another seat's action may break a rule or misread a card: a blocker without
flying on a flier, a land entering untapped that says it enters tapped, a trigger
the card does not have. The table does not stop these. Your jev is offered an
objection to each action since its last decision, and a judge rules.

Object when an action contradicts a printed card or a rule you can cite. Do not
object to play you merely dislike. The judge's remedy can rewind the game to
before the action; the offending seat then decides again.
