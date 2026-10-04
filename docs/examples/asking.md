# When the plan asks for a new one

Jev flies the plan. It does not work out a new line when the plan stops fitting.
Strategy writes the next plan, and each new plan costs a whole planning
session. So name the few facts that really break the line, and no others.

`askWhen` lists visible facts, written as conditions, that mean the plan no
longer fits. Good ones are about the position:

- the creature the plan protects is gone;
- the opponent has more untapped mana than the plan assumed;
- a card the plan relies on was countered, discarded or exiled;
- the opponent has a blocker the plan did not expect.

How the table treats them:

- **A stop fires when its fact becomes true.** A fact that already holds when
  the plan is accepted waits until it has been false, so a stop never fires on
  the position it was written for.
- **A stop with a `when` is watched only in that window.** It fires there when
  its fact holds, at most once a turn.
- **Two new plans a turn, at most,** from stops and jev's `ask:help` together.
  Past that, jev decides with the plan as it stands.
- **A step that cannot be taken now is passed over,** not a stop. Many steps
  are "if able". If a missing step really breaks the line, say so in `askWhen`.

Jev can also choose `ask:help` on any decision the plan does not cover well,
with a reason. It counts against the same two.

Red racing Green, with its attacks written out and three stops:

```json plan
{
  "objective": "Race: Green's life to zero before Hydra takes over.",
  "guidance": "Attack with both creatures every turn. Burn a blocker only when that lets two or more damage through; otherwise burn face at Green's end step.",
  "steps": [
    { "label": "Attack with Zhao", "when": { "active": "self", "step": "declare-attackers" },
      "action": { "prefix": "attack:", "objects": { "card": "Zhao, the Moon Slayer" } } },
    { "label": "Attack with Kellan", "when": { "active": "self", "step": "declare-attackers" },
      "action": { "prefix": "attack:", "objects": { "card": "Kellan, Planar Trailblazer" } } },
    { "label": "Finish attacking", "when": { "active": "self", "step": "declare-attackers" }, "action": { "option": "attack:done" } }
  ],
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
condition, put it in the guidance as prose; jev reads the guidance and can ask
for help when it sees it.
