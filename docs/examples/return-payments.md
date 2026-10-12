# Returning a permanent as payment

`cost.return` selects controlled battlefield permanents and returns each to its
owner's hand while paying. The payment belongs to the announcement, before any
player can respond. It is not a resolving bounce. Like sacrifice, it accepts a
ref or `choose` plus `count`, and the same object cannot leave to pay twice.

`blocked: false` selects unblocked attackers after the blocker declaration.
Before that declaration, attackers are neither blocked nor unblocked. A blocked
attacker stays blocked after its blocker leaves (509.1h). The current rules step
is available as a condition; combine it with whose turn it is.

## The Last Ronin's Technique

The ordinary and sneak casts have separate procedures, like other alternative
costs. This instant's tokens use the usual entering-attacker defender choices
(508.4). Rule 702.190b's same-defender requirement concerns a permanent spell
cast for sneak, not tokens made by an instant. Permanent-spell sneak entry with
the returned attacker's defender remains unsupported.

```json procedure
{
  "source": { "card": "The Last Ronin's Technique", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast The Last Ronin's Technique normally",
  "basis": "Create three 1/1 white Ninja Turtle Spirit creature tokens. If this spell's sneak cost was paid, they enter tapped and attacking.",
  "timing": "spell",
  "instructions": [
    { "do": "token", "count": 3,
      "spec": { "name": "Ninja Turtle Spirit Token", "types": ["creature"], "subtypes": ["Ninja", "Turtle", "Spirit"], "colors": ["W"], "power": 1, "toughness": 1 } }
  ]
}
```

```json procedure
{
  "source": { "card": "The Last Ronin's Technique", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast The Last Ronin's Technique for sneak",
  "basis": "Sneak {1}{W} (You may cast this spell for {1}{W} if you also return an unblocked attacker you control to hand during the declare blockers step.) ... Create three 1/1 white Ninja Turtle Spirit creature tokens. If this spell's sneak cost was paid, they enter tapped and attacking.",
  "timing": "spell",
  "if": { "all": [{ "turn": "self" }, { "step": "declare-blockers" }] },
  "cost": { "mana": "{1}{W}", "return": { "choose": { "types": ["creature"], "blocked": false }, "count": 1 } },
  "instructions": [
    { "do": "token", "count": 3, "tapped": true, "attacking": true,
      "spec": { "name": "Ninja Turtle Spirit Token", "types": ["creature"], "subtypes": ["Ninja", "Turtle", "Spirit"], "colors": ["W"], "power": 1, "toughness": 1 } }
  ]
}
```

The source's current zone must still permit casting. These procedures do not
grant graveyard or exile permission, certify the interpretation, or choose a
payment or defender for the seat.
