# Properties of future spells

Mistrise Village's resolved activation changes the next spell its controller
casts that turn. This is an effect applied during announcement, not a delayed
trigger. Opponents receive priority only after that spell carries the words.
An opponent's spell and any activated ability leave the effect unused.

```json procedure
{
  "source": { "card": "Mistrise Village", "zones": ["battlefield"], "controller": "self" },
  "claim": "Protect the next spell with Mistrise Village",
  "basis": "{U}, {T}: The next spell you cast this turn can't be countered.",
  "timing": "stack",
  "cost": { "mana": "{U}", "tap": true },
  "instructions": [{ "do": "spell-words", "who": "you", "words": ["can't be countered"], "next": true, "until": "end-of-turn" }]
}
```

The unused effect expires at the end of the turn. The applied words belong to
that spell and do not become a permanent's abilities. Counter instructions
offer the seat an explicit choice to respect the restriction; the original
instruction stays available with its conflict marked. Acceptance checks the
source and syntax, not whether the card interpretation is legal.
