# Spells with targets, modes and kicker

A spell is a procedure with `timing: "spell"` and its card in hand. Leave out
`cost.mana` and it pays the printed cost. Its timing comes from the type line:
an instant whenever you have priority, anything else in your main phase with an
empty stack.

Targets are slots. "Any target" names both an object selector and players.
The target is picked from the menu when the spell is announced, not written into
the procedure, so one procedure serves every target.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Shock" },
  "claim": "Cast Shock",
  "basis": "Shock deals 2 damage to any target.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
  "instructions": [{ "do": "damage", "to": "target:0", "amount": 2 }]
}
```

Destroying is its own instruction because indestructible refuses it.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Fell" },
  "claim": "Cast Fell",
  "basis": "Destroy target creature.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [{ "do": "destroy", "what": "target:0" }]
}
```

## Modes are separate procedures

"Choose one" is the choice of which procedure to announce. Each mode gets its
own claim, targets and instructions, and a plan offers whichever modes it wants.
Auntie's Sentence's second mode:

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Auntie's Sentence" },
  "claim": "Auntie's Sentence: target creature gets -2/-2",
  "basis": "Target creature gets -2/-2 until end of turn.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [{ "do": "modify", "what": "target:0", "until": "end-of-turn",
    "change": { "power": -2, "toughness": -2 } }]
}
```

Its first mode reveals a hand for another seat to choose from; see `reveal.md`.

## Kicker is a procedure with the bigger cost

A kicked Burst Lightning is the same card announced with `{4}` added and its
kicked effect. There is no "was it kicked" flag: the procedure already says 4.
Quote both pieces of text the variant relies on, joined by ` ... `.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Burst Lightning" },
  "claim": "Cast Burst Lightning kicked",
  "basis": "Kicker {4} ... If this spell was kicked, it deals 4 damage instead.",
  "timing": "spell",
  "cost": { "mana": "{4}{R}" },
  "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
  "instructions": [{ "do": "damage", "to": "target:0", "amount": 4 }]
}
```

## Activated abilities on tokens are procedures too

A Food's "{2}, {T}, Sacrifice this token: You gain 3 life" is not something the
token watches for. It is something its controller announces, so it belongs in a
plan as a procedure, not in the token's registrations. Tokens register only what
happens without being announced: mana abilities, triggers and statics. Bake
into a Pie destroys and makes a Food with no registrations:

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Bake into a Pie" },
  "claim": "Cast Bake into a Pie",
  "basis": "Destroy target creature. Create a Food token.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [
    { "do": "destroy", "what": "target:0" },
    { "do": "token", "count": 1, "spec": { "name": "Food", "types": ["artifact"], "subtypes": ["Food"], "colors": [] } }
  ]
}
```

and the plan that wants the life later announces:

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Food" },
  "claim": "Sacrifice a Food for 3 life",
  "basis": "{2}, {T}, Sacrifice this token: You gain 3 life.",
  "timing": "stack",
  "cost": { "mana": "{2}", "tap": true, "sacrifice": "this" },
  "instructions": [{ "do": "life", "who": "you", "amount": 3 }]
}
```
