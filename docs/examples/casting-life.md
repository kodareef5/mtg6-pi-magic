# Additional life costs from standing abilities

A `cost` registration can require additional `life` instead of, or alongside,
a generic `reduce`. Its `cast` selector reads the proposed spell after targets
are selected, before costs are paid (601.2f). `targeting` matches the selected
target incarnations. Targeting the same source in several slots incurs its
additional cost once; targeting two sources with that ability incurs both.

The charge adds to the spell's own life cost and applies with alternative
casting prices, including a permission to cast without paying mana. Activated
and triggered abilities do not cast a spell. No life is paid during the staged
choices or after cancellation. The final payment combines life costs and life
spent by mana abilities, and remains payable down to exactly zero life.

```json package
{
  "card": "Terror of the Peaks",
  "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flying", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["flying"] } },
    { "kind": "cost", "basis": "Spells your opponents cast that target this creature cost an additional 3 life to cast.",
      "cast": { "zones": ["stack"], "controller": "opponent", "targeting": { "is": "this" } }, "life": 3 },
    { "kind": "watch", "basis": "Whenever another creature you control enters, this creature deals damage equal to that creature's power to any target.",
      "event": { "on": "enters", "of": { "types": ["creature"], "controller": "you", "other": true } },
      "effect": { "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
        "instructions": [{ "do": "damage", "from": "this", "to": "target:0", "amount": { "power": "event:object" } }] } }
  ]
}
```

Bitter Triumph's life branch pays six life when targeting an opposing Terror.
Its discard branch still pays Terror's three life.

```json procedure
{
  "source": { "card": "Bitter Triumph", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Bitter Triumph by paying life", "timing": "spell",
  "basis": "As an additional cost to cast this spell, discard a card or pay 3 life. ... Destroy target creature or planeswalker.",
  "cost": { "life": 3 }, "targets": [{ "object": { "types": ["creature", "planeswalker"] } }],
  "instructions": [{ "do": "destroy", "what": "target:0" }]
}
```

```json procedure
{
  "source": { "card": "Bitter Triumph", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Bitter Triumph by discarding", "timing": "spell",
  "basis": "As an additional cost to cast this spell, discard a card or pay 3 life. ... Destroy target creature or planeswalker.",
  "cost": { "discard": 1 }, "targets": [{ "object": { "types": ["creature", "planeswalker"] } }],
  "instructions": [{ "do": "destroy", "what": "target:0" }]
}
```

Mana-only forecasts mark a position with standing life costs as unpriced and
refer to the offered payment. This form does not supply arbitrary nonmana taxes,
cost increases in mana, or replacement effects forbidding life payments.
The paid total records resources spent, not a ruling that the card meaning is
correct.
