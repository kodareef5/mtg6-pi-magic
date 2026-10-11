# Native casting permissions

A source zone on a procedure states where that use applies. It does not grant
permission to cast there. Winternight Stories registers its own graveyard
permission before play. That permission makes its graveyard use required
interpretation work even when the seat cannot afford it (702.180).

`permit.cast` grants this card's owner a cast from the named zones for the stated
alternative mana cost, at normal timing. `leavesStack` replaces every departure
from the stack when this price was chosen. The registration does not express
mandatory nonmana permission costs; do not use it to omit such a cost.

```json package
{
  "card": "Winternight Stories",
  "registers": [{
    "kind": "permit",
    "basis": "Harmonize {4}{U} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by {X}, where X is its power. Then exile this spell.)",
    "cast": { "from": ["graveyard"], "mana": "{4}{U}", "leavesStack": "exile" }
  }],
  "deferred": [{
    "claim": "Draw three, then discard a creature or two cards",
    "basis": "Draw three cards. Then discard two cards unless you discard a creature card.",
    "source": { "card": "Winternight Stories", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
    "timing": "spell"
  }, {
    "claim": "Harmonize Winternight Stories with an optional creature tap",
    "basis": "Draw three cards. Then discard two cards unless you discard a creature card. ... Harmonize {4}{U} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by {X}, where X is its power. Then exile this spell.)",
    "source": { "card": "Winternight Stories", "zones": ["graveyard"], "controller": "any" },
    "timing": "spell"
  }]
}
```

## The ordinary effect

The seat chooses its discard branch during resolution, after drawing. The
optional creature selection and the mandatory two-card selection have separate
bindings, each restricted to its controller's hand. Every selected card is
discarded by the following move. A selection without `as` stores no binding.

```json procedure
{
  "claim": "Winternight Stories draws and discards",
  "source": { "card": "Winternight Stories", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "basis": "Draw three cards. Then discard two cards unless you discard a creature card.",
  "timing": "spell",
  "instructions": [
    { "do": "draw", "who": "you", "count": 3 },
    { "do": "choose", "who": "you", "from": { "zones": ["hand"], "controller": "you", "types": ["creature"] }, "count": 1, "may": true, "as": "creature" },
    { "do": "move", "what": "bound:creature", "to": "graveyard", "reason": "discard", "if": { "bound": "creature" } },
    { "do": "choose", "who": "you", "from": { "zones": ["hand"], "controller": "you" }, "count": 2, "as": "cards", "if": { "not": { "bound": "creature" } } },
    { "do": "move", "what": "bound:cards", "to": "graveyard", "reason": "discard", "if": { "not": { "bound": "creature" } } }
  ]
}
```

## Optional taps reduce only generic mana

`cost.tap` with `count: 1, upTo: true` offers zero or one untapped permanent
matching its selector. `reduce: "power"` reduces generic mana by the total power
of the chosen permanents, floored at zero. The chosen objects are reserved from
mana production and tapped in the same group that pays the cast. Their current
power is read before payment. This is not a tap-symbol activation, so summoning
sickness does not disqualify the chosen creature (302.6, 702.180b).

The colored {U} remains due even when the creature's power exceeds four. A
different alternative cost cannot be substituted for this graveyard permission.
This variant reuses the printed draw and discard order.

```json procedure
{
  "claim": "Harmonize Winternight Stories",
  "source": { "card": "Winternight Stories", "zones": ["graveyard"], "controller": "any" },
  "basis": "Draw three cards. Then discard two cards unless you discard a creature card. ... Harmonize {4}{U} (You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by {X}, where X is its power. Then exile this spell.)",
  "timing": "spell",
  "cost": { "mana": "{4}{U}", "tap": { "choose": { "types": ["creature"], "controller": "you" }, "count": 1, "upTo": true, "reduce": "power" } },
  "instructions": [
    { "do": "draw", "who": "you", "count": 3 },
    { "do": "choose", "who": "you", "from": { "zones": ["hand"], "controller": "you", "types": ["creature"] }, "count": 1, "may": true, "as": "creature" },
    { "do": "move", "what": "bound:creature", "to": "graveyard", "reason": "discard", "if": { "bound": "creature" } },
    { "do": "choose", "who": "you", "from": { "zones": ["hand"], "controller": "you" }, "count": 2, "as": "cards", "if": { "not": { "bound": "creature" } } },
    { "do": "move", "what": "bound:cards", "to": "graveyard", "reason": "discard", "if": { "not": { "bound": "creature" } } }
  ]
}
```
