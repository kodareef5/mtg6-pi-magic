# Amounts across a selected set

An `aggregate` reads each matching object's current characteristic through the
layers. It takes the `max`, `min` or `sum` of `manaValue`, `power` or `toughness`.
An empty set yields zero. A greatest value is not a count or a sum, and reducing
a generic cost does not remove colored mana requirements.

```json procedure
{
  "source": { "card": "Sunderflock", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast Sunderflock with its greatest-Elemental reduction",
  "basis": "This spell costs {X} less to cast, where X is the greatest mana value among Elementals you control.",
  "timing": "spell",
  "cost": { "reduce": { "aggregate": "max", "of": { "controller": "self", "subtypes": ["Elemental"] }, "value": "manaValue" } },
  "instructions": []
}
```

This procedure supplies the cast. Sunderflock's assessed package supplies flying
and its entry trigger separately. Permissions still govern casts outside hand.
