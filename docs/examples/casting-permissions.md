# Casting permissions

These examples isolate accepted permission terms. They do not assess every
ability on these cards or certify an interpretation. A permission belongs to
one incarnation. An alternative `mana` price permits casting, with normal
timing and additional costs, and gives no land play or printed-price option.
Another independent permission can supply a different price.

## Airbend

The move binds the new exiled object. Its owner is read from that binding, since
the original target no longer exists after the move.

```json package
{
  "card": "Airbender Ascension",
  "registers": [
    { "basis": "When this enchantment enters, airbend up to one target creature.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "targets": [{ "object": { "types": ["creature"] }, "upTo": true }], "instructions": [
        { "do": "move", "what": "target:0", "to": "exile", "reason": "exile", "as": "airbent" },
        { "do": "permit", "what": "bound:airbent", "who": "owner:bound:airbent", "mana": "{2}", "until": "indefinite" }
      ] } }
  ]
}
```

## Through the next turn

`endOfNextTurn` names the player whose next turn ends the permission. Core
records the current turn and expires it during cleanup of that player's next
turn. It survives the creating turn and every intervening opponent turn.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "The Legend of Roku // Avatar Roku", "face": 0 },
  "face": 0,
  "claim": "Resolve Roku's first chapter",
  "basis": "I — Exile the top three cards of your library. Until the end of your next turn, you may play those cards.",
  "timing": "stack",
  "cost": { "mana": "{0}" },
  "instructions": [
    { "do": "move", "what": { "top": 3, "of": "you" }, "to": "exile", "reason": "exile", "as": "exiled" },
    { "do": "permit", "what": "bound:exiled", "who": "you", "until": { "endOfNextTurn": "you" } }
  ]
}
```

The procedure above exercises the chapter's instructions directly. The full
assessment registers a chapter watch to announce them.
