# Increasing a batch of card draws

Quantum Riddler adds one to an entire draw instruction while its controller has
at most one card in hand. Check that condition before any card in the batch
moves (121.2a). Drawing three becomes four, even though the first draw would
raise the hand above the threshold. A later draw instruction checks again.

```json package
{
  "card": "Quantum Riddler", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flying", "affects": { "is": "this", "zones": ["stack", "battlefield"] }, "change": { "words": ["flying"] } },
    { "kind": "watch", "basis": "When this creature enters, draw a card.", "event": { "on": "enters", "of": { "is": "this" } }, "effect": { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] } },
    { "kind": "draw-rule", "basis": "As long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead.", "who": "you", "additional": 1,
      "if": { "amount": { "count": { "zones": ["hand"], "controller": "you" } }, "atMost": 1 } }
  ],
  "deferred": [
    { "claim": "Cast Quantum Riddler for warp", "basis": "Warp {1}{U}", "source": { "card": "Quantum Riddler", "zones": ["hand"], "controller": "self" }, "timing": "spell" }
  ]
}
```

The shared permanent cast supplies its printed price. The alternative use
creates its delayed exile and later-turn permission through the existing warp
operations. Both casts register the same standing terms.

```json procedure
{
  "claim": "Cast Quantum Riddler for warp", "basis": "Warp {1}{U}",
  "source": { "card": "Quantum Riddler", "zones": ["hand"], "controller": "self" },
  "timing": "spell", "cost": { "mana": "{1}{U}", "alternative": "warp" },
  "instructions": [
    { "do": "delay", "event": { "on": "step", "step": "end", "whose": "any" }, "effect": { "instructions": [
      { "do": "move", "what": "this", "to": "exile", "reason": "exile", "as": "warped" },
      { "do": "permit", "what": "bound:warped", "who": "you", "from": "next-turn", "until": "indefinite" }
    ] } }
  ]
}
```

Each matching replacement applies once (614.5). Several Riddlers add one each;
the affected player records their order before drawing. Several players finish
their batches in active-player order, so each later replacement reads the hand
sizes after earlier draws (121.2c). Empty libraries still attempt the increased
draw, and drawing zero stays zero.

An instruction's `as` binding does not carry replaced draws into a later action
on the drawn card (121.6c, 614.11b). Ordinary library-to-hand moves and milling
are not draws. Fixed batch additions are supported; individual-draw replacements,
draw limits, multipliers and replacing draws with other actions are not.
Accepted terms do not certify the card's interpretation.
