# Private inspection and library order

A look grants its actor the named window while the effect resolves. Binding it
with `as` keeps later selections inside that window. Other seats see the number
of cards inspected, without their names, object references or positions.
The private receipt records what the actor saw. This does not implement the
unfinished knowledge-region or probability engine.

## A computed look and random bottom order

This procedure casts Consult the Star Charts with kicker. The unkicked variant
costs its printed {1}{U} and chooses one card instead of two. Both determine
the window from the number of controlled lands when the look resolves.

```json procedure
{
  "source": { "card": "Consult the Star Charts", "zones": ["hand"], "controller": "self" },
  "claim": "Consult the Star Charts with kicker",
  "basis": "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.) ... Look at the top X cards of your library, where X is the number of lands you control. Put one of those cards into your hand. If this spell was kicked, put two of those cards into your hand instead. Put the rest on the bottom of your library in a random order.",
  "timing": "spell",
  "cost": { "mana": "{2}{U}{U}" },
  "instructions": [
    { "do": "look", "who": "you", "what": { "top": { "count": { "types": ["land"], "controller": "you" } }, "of": "you" }, "as": "looked" },
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "is": "bound:looked" }, "count": 2, "as": "taken" },
    { "do": "move", "what": "bound:taken", "to": "hand", "reason": "resolve" },
    { "do": "order", "who": "you", "every": { "zones": ["library"], "is": "bound:looked" }, "position": "bottom", "random": true }
  ]
}
```

## A chosen bottom order

Stock Up takes two of five and orders the remaining cards. An `order` without
`random` asks for each position, topmost first. Neither form changes a card's
zone or incarnation. A shuffle removes inspection access to the randomized
positions. No choice reads or changes the RNG before the action commits.

```json procedure
{
  "source": { "card": "Stock Up", "zones": ["hand"], "controller": "self" },
  "claim": "Stock Up from five cards",
  "basis": "Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.",
  "timing": "spell",
  "instructions": [
    { "do": "look", "who": "you", "what": { "top": 5, "of": "you" }, "as": "looked" },
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "is": "bound:looked" }, "count": 2, "as": "taken" },
    { "do": "move", "what": "bound:taken", "to": "hand", "reason": "resolve" },
    { "do": "order", "who": "you", "every": { "zones": ["library"], "is": "bound:looked" }, "position": "bottom" }
  ]
}
```
