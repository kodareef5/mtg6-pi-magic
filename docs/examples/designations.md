# Harnessed permanents

`designate` records a physical designation on the current permanent. Harnessing
an already harnessed permanent changes nothing (701.64). Leaving the battlefield
clears the designation. It is neither an ability nor a copiable characteristic.

The infinity symbol represents a static ability that grants the printed ability
while the permanent is harnessed (702.186). The continuous registration below
selects the marked permanent and grants its end-step watch. The watch itself
has no intervening condition: once triggered, it can resolve after its source
leaves. These terms do not establish that a player paid the correct harness cost.

```json package
{
  "card": "The Mind Stone",
  "registers": [
    { "kind": "continuous", "basis": "Indestructible", "affects": { "is": "this" }, "change": { "words": ["indestructible"] } },
    { "kind": "mana", "basis": "{T}: Add {W}.", "cost": { "tap": true }, "colors": ["W"] },
    {
      "kind": "continuous",
      "basis": "∞ — At the beginning of your end step, exile up to one other target nonland permanent you control, then return that card to the battlefield under its owner's control.",
      "affects": { "is": "this", "designations": ["harnessed"] },
      "change": { "registers": [{
        "kind": "watch",
        "basis": "∞ — At the beginning of your end step, exile up to one other target nonland permanent you control, then return that card to the battlefield under its owner's control.",
        "event": { "on": "step", "step": "end", "whose": "you" },
        "effect": {
          "targets": [{ "object": { "controller": "you", "other": true, "not": { "types": ["land"] } }, "count": 1, "upTo": true }],
          "instructions": [
            { "do": "move", "what": "target:0", "to": "exile", "reason": "exile", "as": "exiled" },
            { "do": "move", "what": "bound:exiled", "to": "battlefield", "controller": "owner:bound:exiled", "reason": "resolve" }
          ]
        }
      }] }
    }
  ]
}
```

```json procedure
{
  "source": { "card": "The Mind Stone", "zones": ["battlefield"], "controller": "self" },
  "claim": "Harness The Mind Stone",
  "basis": "{5}{W}, {T}: Harness The Mind Stone. (Once harnessed, its ∞ ability is active.)",
  "timing": "stack",
  "cost": { "mana": "{5}{W}", "tap": true },
  "instructions": [{ "do": "designate", "what": "this", "designation": "harnessed" }]
}
```
