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

A union counts each card once. `hasAdventure` reads the pinned alternative
characteristics, including in the graveyard where the creature face is active.
It does not infer an Adventure from Oracle text or expose a hidden card.

```json procedure
{
  "source": { "card": "Hearth Elemental // Stoke Genius", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "face": 0,
  "claim": "Cast Hearth Elemental with its graveyard reduction",
  "basis": "This spell costs {X} less to cast, where X is the number of cards in your graveyard that are instant cards, sorcery cards, and/or have an Adventure.",
  "timing": "spell",
  "cost": { "reduce": { "count": { "zones": ["graveyard"], "owner": "you", "any": [ { "types": ["instant", "sorcery"] }, { "hasAdventure": true } ] } } },
  "instructions": []
}
```

The Adventure cast is a separate use. This procedure does not prepare its
discard and draw instructions or grant permission from other zones.
