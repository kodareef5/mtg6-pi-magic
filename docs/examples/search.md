# Searching a library

`choose` from your explicitly scoped library, `move` what you bound, then
`shuffle`. New games record a search start before showing your library to you.
The private look includes nonmatching cards and ends when the effect finishes
or the library is shuffled. See [search events](library-searches.md).

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

A search from a spell is the same three steps. They Went This Way also
investigates, which makes a Clue token:

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "They Went This Way" },
  "claim": "Cast They Went This Way",
  "basis": "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Investigate.",
  "timing": "spell",
  "instructions": [
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "as": "land" },
    { "do": "move", "what": "bound:land", "to": "battlefield", "tapped": true, "reason": "resolve" },
    { "do": "shuffle", "who": "you" },
    { "do": "token", "count": 1, "spec": { "name": "Clue", "types": ["artifact"], "subtypes": ["Clue"], "colors": [] } }
  ]
}
```

Identical cards in a library are one choice in the menu: nothing tells two
Forests apart.

Alternate face casts and Omen continuations use the terms in [faces](faces.md).
