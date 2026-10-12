# Activation cost reductions

A `cost` registration with `activate` selects the ability's source in its
current zone. `reduce` subtracts generic mana from the total activation cost,
with a floor of zero (118.7a, 601.2f, 602.2b). Colored and colorless symbols,
tap, sacrifice and other nonmana costs stay payable. Multiple reductions add.
The price is locked before payment, even if paying removes the reduction's source.

Menus, X bounds and mana forecasts read the same standing terms. A forecast
that cannot account for an additional cost remains unchecked. A discount gives
no permission to activate and does not change a spell or a resolving payment.
Ability-text filters, activation cost increases and additional activation life
costs remain unsupported.

## Mutagen Man, Living Ooze

The entry trigger reads the announced X, including zero. Every Mutagen carries
its full ability. The discount removes its one generic mana, but its controller
still chooses a legal target and pays tap and sacrifice at sorcery speed.

```json package
{
  "card": "Mutagen Man, Living Ooze",
  "registers": [
    { "kind": "continuous", "basis": "Trample", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["trample"] } },
    { "kind": "cost", "basis": "Activated abilities of artifact tokens you control cost {1} less to activate.",
      "activate": { "zones": ["battlefield"], "types": ["artifact"], "token": true, "controller": "you" }, "reduce": 1 },
    { "kind": "watch", "basis": "When Mutagen Man enters, create X Mutagen tokens. (They're artifacts with \"{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.\")",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": { "x": true }, "spec": {
        "name": "Mutagen", "types": ["artifact"], "subtypes": ["Mutagen"], "colors": [],
        "registers": [{ "kind": "activated", "basis": "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
          "speed": "sorcery", "cost": { "mana": "{1}", "tap": true, "sacrifice": "this" },
          "effect": { "targets": [{ "object": { "zones": ["battlefield"], "types": ["creature"] } }],
            "instructions": [{ "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 }] } }]
      } }] } }
  ],
  "procedures": [{ "claim": "Cast Mutagen Man with X", "source": { "card": "Mutagen Man, Living Ooze", "zones": ["hand"], "controller": "self" },
    "basis": "When Mutagen Man enters, create X Mutagen tokens. (They're artifacts with \"{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.\")",
    "timing": "spell", "cost": { "mana": "{X}{G}{G}" }, "instructions": [] }]
}
```
