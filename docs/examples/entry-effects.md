# A resolving effect changes an entering permanent

Enduring Curiosity returns as an enchantment. `move.change` applies that
continuous effect with the move under 611.2e. Entry replacements and triggers
read the changed characteristics. A separate `modify` instruction would let
it enter as a creature first, which is wrong for this wording.

The change lasts for this battlefield incarnation and is not copiable. It does
not change the printed card or remove its abilities. Losing the creature type
also removes Cat and Glimmer under 205.1a, and a noncreature has no power or
toughness under 208.3. A later animation can make it a creature again. Its next
zone change ends the effect.

```json package
{
  "card": "Enduring Curiosity",
  "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flash", "affects": { "is": "this", "zones": ["hand", "graveyard", "exile", "library", "command", "outside", "stack", "battlefield"] }, "change": { "words": ["flash"] } },
    { "kind": "watch", "basis": "Whenever a creature you control deals combat damage to a player, draw a card.",
      "event": { "on": "combat-damage", "of": { "types": ["creature"], "controller": "you" }, "player": true },
      "effect": { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] } },
    { "kind": "watch", "basis": "When Enduring Curiosity dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)",
      "event": { "on": "dies", "of": { "is": "this", "types": ["creature"] } },
      "effect": { "instructions": [{ "do": "move", "what": "event:object", "to": "battlefield", "controller": "owner:event:object", "reason": "resolve", "change": { "types": { "set": ["enchantment"] } } }] } }
  ]
}
```

The death watch checks the permanent's last battlefield characteristics, so
the return triggers only if it was a creature then. The move names its
owner's control explicitly. A new incarnation of the graveyard card is not the card that
triggered this ability and cannot be returned by it.

Use `move.change` only for a characteristic effect that applies with entry.
It does not implement an entry replacement that needs ordering against another
replacement, or a copy exception. Use `copy.except` for copiable exceptions.
