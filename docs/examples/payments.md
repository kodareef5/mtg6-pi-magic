# Costs chosen before the effect

These procedures carry the paid additional-cost variants. Separate ordinary
variants omit both the extra cost and its stronger result. Syntax acceptance
checks the stated payment and source text; it does not certify the interpretation.

```json procedure
{
  "source": { "card": "Requiting Hex", "zones": ["hand"], "controller": "self" },
  "claim": "Blighted Requiting Hex",
  "basis": "As an additional cost to cast this spell, you may blight 1. (You may put a -1/-1 counter on a creature you control.)\nDestroy target creature with mana value 2 or less. If this spell's additional cost was paid, you gain 2 life.",
  "timing": "spell",
  "cost": { "counters": { "kind": "-1/-1", "count": 1, "put": true, "on": { "choose": { "types": ["creature"], "controller": "you" }, "count": 1 } } },
  "targets": [{ "object": { "types": ["creature"], "manaValue": { "atMost": 2 } } }],
  "instructions": [{ "do": "destroy", "what": "target:0" }, { "do": "life", "who": "you", "amount": 2 }]
}
```

```json procedure
{
  "source": { "card": "Dispelling Exhale", "zones": ["hand"], "controller": "self" },
  "claim": "Dispelling Exhale with a beheld Dragon",
  "basis": "As an additional cost to cast this spell, you may behold a Dragon. (You may choose a Dragon you control or reveal a Dragon card from your hand.)\nCounter target spell unless its controller pays {2}. If a Dragon was beheld, counter that spell unless its controller pays {4} instead.",
  "timing": "spell",
  "cost": { "show": { "choose": { "zones": ["hand", "battlefield"], "controller": "you", "subtypes": ["Dragon"] }, "count": 1 } },
  "targets": [{ "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "planeswalker", "sorcery"] } }],
  "instructions": [{ "do": "counter", "what": "target:0", "unless": { "who": "controller:target:0", "pays": { "mana": "{4}" } } }]
}
```

Dyadrine's [attack example](cast-facts.md) instead pays during resolution. It
offers a complete pair of creatures with counters, or decline. One creature
cannot supply both shares; if the pair is unavailable, no counter is removed
and the later draw and token creation do not happen.
