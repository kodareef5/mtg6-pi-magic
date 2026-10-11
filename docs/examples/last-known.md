# Information after a zone change

Inevitable Defeat exiles its target before changing life totals. The target's
former controller loses life, even when the card has a different owner.
Information readers use the old incarnation; a later move cannot move it again.
Targets illegal when resolution begins remain excluded from both readers.

```json procedure
{
  "source": { "card": "Inevitable Defeat", "zones": ["hand"], "controller": "self" },
  "claim": "Exile, then change life totals with Inevitable Defeat",
  "basis": "This spell can't be countered.\nExile target nonland permanent. Its controller loses 3 life and you gain 3 life.",
  "timing": "spell",
  "words": ["can't be countered"],
  "targets": [{ "object": { "not": { "types": ["land"] } } }],
  "instructions": [
    { "do": "move", "what": "target:0", "to": "exile", "reason": "exile" },
    { "do": "life", "who": "controller:target:0", "amount": -3 },
    { "do": "life", "who": "you", "amount": 3 }
  ]
}
```
