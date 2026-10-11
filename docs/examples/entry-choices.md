# Chosen characteristics on entry

An `enters.choose` registration records the controller's answer under `as`.
The type choice precedes the optional life payment, and both precede entry.
The answer belongs to that incarnation. A subtype modification reads it through
`set.chosen`; the permanent does not store derived types or mana abilities.

```json package
{
  "card": "Multiversal Passage",
  "assessed": true,
  "registers": [
    {
      "basis": "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters tapped.",
      "kind": "enters",
      "choose": { "as": "landType", "from": "basic-land-type" },
      "tapped": true,
      "unlessPay": { "life": 2 }
    },
    {
      "basis": "This land is the chosen type.",
      "kind": "continuous",
      "affects": { "is": "this" },
      "change": { "subtypes": { "set": { "chosen": "landType" }, "of": "land" } }
    }
  ]
}
```

The chosen basic type grants its intrinsic mana ability under 305.6 and removes
the land's own printed abilities under 305.7. It does not make the land basic.
The entry replacement already in progress finishes its payment and tapped
instructions even though the resulting permanent loses that ability.
An absent choice supplies no subtype or mana ability. General replacement
ordering remains unsupported.

Creature-type entry choices list every type in the pinned rule 205.3m, including
Time Lord. A mana ability freezes `subtypes.chosen` when it produces mana. The
restriction and `spellWords` stay with that mana if the land leaves or returns
with a different choice. Only spending the colored mana grants the words; the
unrestricted colorless ability grants none (106.6).

```json package
{
  "card": "Cavern of Souls",
  "assessed": true,
  "registers": [
    { "basis": "As this land enters, choose a creature type.", "kind": "enters", "choose": { "as": "creatureType", "from": "creature-type" } },
    { "basis": "{T}: Add {C}.", "kind": "mana", "cost": { "tap": true }, "colors": ["C"] },
    {
      "basis": "{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.",
      "kind": "mana",
      "cost": { "tap": true },
      "any": 1,
      "spendOnly": { "zones": ["stack"], "types": ["creature"], "subtypes": { "chosen": "creatureType" } },
      "spellWords": ["can't be countered"]
    }
  ]
}
```

These terms do not certify a card interpretation. A missing named type matches
no creature; the table does not substitute a type from the deck or battlefield.
