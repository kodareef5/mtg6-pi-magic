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
An absent choice supplies no subtype or mana ability. Choices on other kinds
of entry replacement and general replacement ordering remain unsupported.
