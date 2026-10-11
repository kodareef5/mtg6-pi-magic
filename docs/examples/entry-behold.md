# Beholding before entry

Theorist's Sanctum lets its controller behold a Jace before it enters. A Jace
already on the battlefield is chosen; a Jace card in that player's hand is
revealed. Neither card is spent. Declining makes the land enter tapped.

The entry decision uses the same `show` cost as behold during casting. All
choices in a simultaneous entry group finish before any card enters or any
hand card is revealed. A separate tapped instruction still applies after paying.
This example supplies the entry term; the Empower activation still needs its
own identified use and interpretation.

```json package
{
  "card": "Theorist's Sanctum",
  "registers": [{
    "kind": "enters",
    "basis": "As this land enters, you may behold a Jace. If you don't, this land enters tapped. (To behold a Jace, choose a Jace you control or reveal a Jace card from your hand.)",
    "tapped": true,
    "unlessPay": { "show": { "choose": { "zones": ["hand", "battlefield"], "controller": "you", "subtypes": ["Jace"] }, "count": 1 } }
  }]
}
```
