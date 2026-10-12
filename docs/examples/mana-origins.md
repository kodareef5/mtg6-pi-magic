# Mana restricted by casting origin

`spendFrom` names the original zones a spell may be cast from. It does not select
the spell's current stack zone, grant permission to cast, or pay for activating
an exiled card's ability. The restriction travels with floating mana even if
its source leaves. `spendOnly` can further restrict the proposed spell's traits.

`any: 2, combination: true` offers every pair of colors, including mixed pairs.
Without `combination`, `any` means one chosen color for the whole output.
`times` multiplies the number of independently chosen mana for a combination.
A payment can spend only part of that output. Paying {G} from Web Watch offers
five possible remaining colors. Its other unit stays floating, still restricted
to spells cast from exile, even if the Watch leaves. Payment menus name both the
spent and unspent output (106.4a); the casting history counts only mana spent.
The ordered forecast can use the remainder for a later spell in the same step.

New journals enable this payment contract from decision zero. A historical
journal keeps exact-output menus unless its header names an `excessManaFrom`
decision boundary. Replay and cloning retain that boundary; changing a model's
plan does not change it. This does not prepare unrelated card uses or promise
that an interpreted mana ability matches its source.

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
