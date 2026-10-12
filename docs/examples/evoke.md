# Remembering an alternative casting cost

`cost.alternative` names the one alternative cost the seat selects. Its `mana`
states that price, including `{0}` for a cost without mana. Additional costs
and reductions still apply. `{cast: "this", alternative: "evoke"}` reads the
recorded choice, not an inferred price or the amount spent (118.9, 702.74a).

Deceit's entry abilities independently read actual blue and black mana spent.
Both can trigger on a full-price cast. Its evoke sacrifice is an ordinary
intervening-if entry trigger; it uses the stack and can resolve before or after
the other entry abilities. Sacrificing Deceit first does not erase their payment
facts or remove the other abilities from the stack.

```json package
{
  "card": "Deceit",
  "printedCast": true,
  "registers": [{
    "kind": "watch",
    "basis": "When this creature enters, if {U}{U} was spent to cast it, return up to one other target nonland permanent to its owner's hand.",
    "event": { "on": "enters", "of": { "is": "this" } },
    "if": { "amount": { "manaSpent": "this", "color": "U" }, "atLeast": 2 },
    "effect": {
      "targets": [{ "object": { "other": true, "not": { "types": ["land"] } }, "upTo": true }],
      "instructions": [{ "do": "move", "what": "target:0", "to": "hand", "reason": "resolve" }]
    }
  }, {
    "kind": "watch",
    "basis": "When this creature enters, if {B}{B} was spent to cast it, target opponent reveals their hand. You choose a nonland card from it. That player discards that card.",
    "event": { "on": "enters", "of": { "is": "this" } },
    "if": { "amount": { "manaSpent": "this", "color": "B" }, "atLeast": 2 },
    "effect": {
      "targets": [{ "player": "opponent" }],
      "instructions": [
        { "do": "reveal", "every": { "zones": ["hand"], "owner": "target:0" }, "as": "hand" },
        { "do": "choose", "who": "you", "count": 1, "as": "discard", "from": { "zones": ["hand"], "is": "bound:hand", "not": { "types": ["land"] } } },
        { "do": "move", "what": "bound:discard", "to": "graveyard", "reason": "discard" }
      ]
    }
  }, {
    "kind": "watch", "basis": "Evoke {U/B}{U/B}",
    "event": { "on": "enters", "of": { "is": "this" } },
    "if": { "cast": "this", "alternative": "evoke" },
    "effect": { "instructions": [{ "do": "move", "what": "this", "to": "graveyard", "reason": "sacrifice" }] }
  }],
  "procedures": [{
    "claim": "Evoke Deceit", "basis": "Evoke {U/B}{U/B}",
    "source": { "card": "Deceit", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
    "timing": "spell", "cost": { "mana": "{U/B}{U/B}", "alternative": "evoke" }, "instructions": []
  }]
}
```

The source zones identify where this use can apply; they grant no permission.
A normal casting permission from exile or graveyard can use evoke. A permission
requiring its own alternative price cannot combine with evoke, even if the
two prices have the same mana symbols. Named alternative costs belong to spell
announcements, not activated abilities or payments during resolution.

Resolving from the stack preserves the name for the resulting permanent.
Leaving and returning breaks that association. A reanimated or manifested
creature was not evoked. Acceptance checks the syntax and source quote; it does
not certify that another card grants the claimed alternative cost.
