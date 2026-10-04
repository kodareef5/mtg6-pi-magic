# Searching a library

There is no search instruction. You look, pick, and move, as hands do:
`choose` from your library, `move` what you bound, then `shuffle`. The choice
shows your library to you and nobody else, only while you choose.

Searching for cards with a stated quality may find nothing (701.23b), so write
`upTo`. Nothing is revealed unless the card says so (701.23e).

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Fabled Passage" },
  "claim": "Crack Fabled Passage for a basic land",
  "basis": "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.",
  "timing": "stack",
  "cost": { "tap": true, "sacrifice": "this" },
  "instructions": [
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "as": "land" },
    { "do": "move", "what": "bound:land", "to": "battlefield", "tapped": true, "reason": "resolve" },
    { "do": "shuffle", "who": "you" },
    { "do": "untap", "what": "bound:land", "if": { "amount": { "count": { "types": ["land"], "controller": "you" } }, "atLeast": 4 } }
  ]
}
```

The land that enters triggers your landfall watches. That is the point of the
card in a landfall deck, so a plan usually cracks it at a moment when those
triggers matter.

A search from a spell is the same three steps. Roost Seek is the Omen half of
Sagu Wildling:

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Sagu Wildling // Roost Seek" },
  "claim": "Cast Roost Seek",
  "basis": "Search your library for a basic land card, reveal it, put it into your hand, then shuffle. (Also shuffle this card.)",
  "timing": "spell",
  "cost": { "mana": "{G}" },
  "instructions": [
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "reveal": true, "as": "land" },
    { "do": "move", "what": "bound:land", "to": "hand", "reason": "resolve" },
    { "do": "move", "what": "this", "to": "library", "reason": "resolve" },
    { "do": "shuffle", "who": "you" }
  ]
}
```

An Omen shuffles itself into its library as it resolves instead of going to the
graveyard, so it moves itself before the shuffle. The table reads type lines from
the front face only, so casting the back half of a split or Omen card states its
cost.
