# Tapping the source and another permanent

A cost with `tap: true` pays the source's tap symbol. A selected tap cost uses
`tap.choose`; adding `tap.source: true` requires both. The selected objects are
distinct, untapped permanents controlled by the payer. The source cannot pay
both tap parts. Summoning sickness restricts the tap symbol on a creature
source, but does not prevent another cost from tapping a newly entered creature
(302.6).

```json package
{
  "card": "Springleaf Drum", "printedCast": true,
  "registers": [{
    "kind": "mana", "basis": "{T}, Tap an untapped creature you control: Add one mana of any color.",
    "cost": { "tap": { "source": true, "choose": { "zones": ["battlefield"], "controller": "you", "types": ["creature"], "tapped": false }, "count": 1 } },
    "any": 1
  }]
}
```

```json package
{
  "card": "Gene Pollinator", "printedCast": true,
  "registers": [{
    "kind": "mana", "basis": "{T}, Tap an untapped permanent you control: Add one mana of any color.",
    "cost": { "tap": { "source": true, "choose": { "zones": ["battlefield"], "controller": "you", "tapped": false }, "count": 1 } },
    "any": 1
  }]
}
```

Both registrations can fund a spell or other mana payment. Each choice names
both tapped objects and the color produced. Complete and individual payments
reserve both objects: a creature cannot pay two Drums, and a Forest tapped for
Pollinator cannot also supply its own mana. Holds and later planned attacks
retain those same resource identities. No object taps until confirmation.

The same cost works in a prepared mana procedure. This green-output variant
illustrates one of the five color choices; it does not replace the other four.

```json procedure
{
  "claim": "Add green with Springleaf Drum",
  "basis": "{T}, Tap an untapped creature you control: Add one mana of any color.",
  "source": { "card": "Springleaf Drum", "zones": ["battlefield"], "controller": "self" },
  "timing": "mana",
  "cost": { "tap": { "source": true, "choose": { "zones": ["battlefield"], "controller": "you", "types": ["creature"], "tapped": false }, "count": 1 } },
  "instructions": [{ "do": "mana", "who": "you", "colors": ["G"] }]
}
```

This adds selected taps to supported mana costs. Arbitrary sacrifice selections,
discard costs and triggered mana abilities during payment remain separate work.
A listed payment checks its accepted cost; it does not certify the card meaning.
