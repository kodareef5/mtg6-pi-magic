# Entering against a prior attacker's defender

A selected return cost can bind its departing incarnation with `as`. A later
battlefield move uses `attacking: { sameAs: "bound:returned" }` to read that
attacker's defender from the current combat, even after it left. The move does
not declare an attack, trigger attack watches, or offer a different defender.
If that defender has left, the permanent still enters tapped but is not attacking
(506.3, 508.4, 702.49c).

Ninjutsu also reveals its source until the ability leaves the stack (702.49b).
`cost.show.until: "leaves-stack"` keeps only the selected incarnation public
while that spell or ability remains on the stack. Countering the ability does
not refund the return or mana cost. Other hidden cards stay hidden.

```json procedure
{
  "claim": "Activate Kaito's ninjutsu against the returned attacker's defender",
  "basis": "Ninjutsu {1}{U}{B} ({1}{U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)",
  "source": { "card": "Kaito, Bane of Nightmares", "zones": ["hand"], "controller": "self" },
  "timing": "stack",
  "cost": {
    "mana": "{1}{U}{B}",
    "show": { "choose": { "is": "this", "zones": ["hand"] }, "count": 1, "until": "leaves-stack" },
    "return": { "choose": { "zones": ["battlefield"], "controller": "you", "types": ["creature"], "attacking": true, "blocked": false }, "count": 1, "as": "returned" }
  },
  "instructions": [
    { "do": "move", "what": "this", "to": "battlefield", "tapped": true, "controller": "you", "attacking": { "sameAs": "bound:returned" }, "reason": "resolve" }
  ]
}
```

This example prepares the hand activation only. Kaito's standing animation and
three loyalty abilities need their own accepted terms. It does not provide
battle defenders or choose among several prior attackers.
