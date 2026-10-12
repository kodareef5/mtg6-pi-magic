# Class levels

`designate` with `designation: {"level": 2}` sets a permanent's physical level.
A permanent without a designation reads as level 1 (716.2d). A level is not a
counter or a copiable characteristic; it persists through type and ability
changes and ends when the permanent leaves. The `level` selector range reads
that designation. An `on: "level"` event watches an actual change; its `level`
field matches the resulting level exactly.

A level bar supplies a sorcery-speed activation usable only at the preceding
level, plus a static grant while the permanent is at that level or higher
(716.2a). The activation restriction is checked when announcing, not again
when resolving. This operation does not certify the stated cost or add level-up
counters. Leveler creatures use counters and are a separate mechanic.

## Cool but Rude

The top ability remains available at every level. The second ability triggers
once per discarded card, even when several cards are discarded together.
Level 3 grants its own change watch in time to trigger. That trigger searches
before shuffling, then randomly discards from the entire hand, including the
card just found. Once triggered it can resolve after the Class leaves.

```json package
{
  "card": "Cool but Rude", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "Whenever you attack, you may discard a card. If you do, draw a card.",
      "event": { "on": "attacked-with", "by": "you" },
      "effect": { "instructions": [
        { "do": "pay", "who": "you", "cost": { "discard": 1 }, "may": true, "as": "discarded" },
        { "do": "draw", "who": "you", "count": 1, "if": { "bound": "discarded" } }
      ] } },
    { "kind": "activated", "basis": "{1}{R}: Level 2", "cost": { "mana": "{1}{R}" }, "speed": "sorcery",
      "if": { "is": "this", "matches": { "level": { "atLeast": 1, "atMost": 1 } } },
      "effect": { "instructions": [{ "do": "designate", "what": "this", "designation": { "level": 2 } }] } },
    { "kind": "continuous", "basis": "Whenever you discard a card, this Class deals 2 damage to each opponent.",
      "affects": { "is": "this", "level": { "atLeast": 2 } }, "change": { "registers": [
        { "kind": "watch", "basis": "Whenever you discard a card, this Class deals 2 damage to each opponent.",
          "event": { "on": "discarded", "by": "you" },
          "effect": { "instructions": [{ "do": "damage", "to": "opponent", "amount": 2 }] } }
      ] } },
    { "kind": "activated", "basis": "{1}{R}: Level 3", "cost": { "mana": "{1}{R}" }, "speed": "sorcery",
      "if": { "is": "this", "matches": { "level": { "atLeast": 2, "atMost": 2 } } },
      "effect": { "instructions": [{ "do": "designate", "what": "this", "designation": { "level": 3 } }] } },
    { "kind": "continuous", "basis": "When this Class becomes level 3, search your library for a card, put it into your hand, shuffle, then discard a card at random.",
      "affects": { "is": "this", "level": { "atLeast": 3 } }, "change": { "registers": [
        { "kind": "watch", "basis": "When this Class becomes level 3, search your library for a card, put it into your hand, shuffle, then discard a card at random.",
          "event": { "on": "level", "of": { "is": "this" }, "level": 3 },
          "effect": { "instructions": [
            { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you" }, "count": 1, "as": "found" },
            { "do": "move", "what": "bound:found", "to": "hand", "reason": "resolve" },
            { "do": "shuffle", "who": "you" },
            { "do": "choose", "who": "you", "from": { "zones": ["hand"], "owner": "you" }, "count": 1, "random": true, "as": "discarded" },
            { "do": "move", "what": "bound:discarded", "to": "graveyard", "reason": "discard" }
          ] } }
      ] } }
  ]
}
```
