# Mana restricted by casting origin

`spendFrom` names the original zones a spell may be cast from. It does not select
the spell's current stack zone, grant permission to cast, or pay for activating
an exiled card's ability. The restriction travels with floating mana even if
its source leaves. `spendOnly` can further restrict the proposed spell's traits.

`any: 2, combination: true` offers every pair of colors, including mixed pairs.
Without `combination`, `any` means one chosen color for the whole output.
`times` multiplies the number of independently chosen mana for a combination.
These terms do not yet provide a payment that spends part of a source's output;
Web Watch must remain blocked until the remainder can stay in the pool.

```json package
{
  "card": "Interdimensional Web Watch",
  "registers": [
    {
      "kind": "watch",
      "basis": "When this artifact enters, exile the top two cards of your library. Until the end of your next turn, you may play those cards.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "move", "what": { "top": 2, "of": "you" }, "to": "exile", "reason": "exile", "as": "exiled" },
        { "do": "permit", "what": "bound:exiled", "who": "you", "until": { "endOfNextTurn": "you" } }
      ] }
    },
    {
      "kind": "mana",
      "basis": "{T}: Add two mana in any combination of colors. Spend this mana only to cast spells from exile.",
      "cost": { "tap": true }, "any": 2, "combination": true,
      "spendFrom": ["exile"]
    }
  ]
}
```
