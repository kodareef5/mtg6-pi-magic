# X and computed amounts

`{X}` in a cost is a number you announce as you cast (601.2b). `{"x": true}`
reads it. A permanent cast with X remembers it, so its enters trigger can use it
(107.3m).

```json package
{
  "card": "Ajani's Anguish",
  "registers": [
    { "basis": "When this enchantment enters, it deals X damage to any target.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
        "instructions": [{ "do": "damage", "to": "target:0", "amount": { "x": true } }] } }
  ]
}
```

Casting it needs no procedure: the table offers the ordinary cast for the printed
`{X}{R}`, and the cast menu asks for X.

## An X that is counted

When the card defines X itself, write the count. `sum` adds amounts, and
`every` hits each matching object at once.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Calamitous Cave-In" },
  "claim": "Cast Calamitous Cave-In",
  "basis": "Calamitous Cave-In deals X damage to each creature and each planeswalker, where X is the number of Caves you control plus the number of Cave cards in your graveyard.",
  "timing": "spell",
  "instructions": [{ "do": "damage", "every": { "types": ["creature", "planeswalker"] },
    "amount": { "sum": [
      { "count": { "subtypes": ["Cave"], "controller": "you" } },
      { "count": { "zones": ["graveyard"], "owner": "you", "subtypes": ["Cave"] } }
    ] } }]
}
```

X is worked out once, as the instruction applies (608.2h), and the same number
hits everything.
