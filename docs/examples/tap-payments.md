# Tapping instead of paying generic mana

A selected tap cost with `pay: "generic"`, `count` and `upTo: true` permits
up to that many matching permanents to replace one generic mana each. Its mana
component is already included in `cost.mana`. The limit belongs to that component;
it never replaces colored symbols or generic mana beyond that limit. Standing
cost adjustments apply before deciding how much generic mana remains.

The announcement records each selection, with remove, back and cancel choices.
Nothing taps until confirmation. A selected permanent cannot also pay a mana
ability's tap cost. Choosing a newly entered creature is allowed because this
payment has no tap symbol. Feasibility finds a possible payment without choosing
one or building all subsets.

`keyword: "waterbend"` records completion of the named cost after payment,
even when no permanent was tapped (701.67). Resulting triggers wait until the
whole announcement is committed. This syntax does not support resolving
waterbend instructions, other costs that move objects, or multiple
separately limited tap-payment components in one cost.

```json procedure
{
  "face": 0,
  "claim": "Waterbend to transform Aang",
  "basis": "Waterbend {8}: Transform Aang.",
  "source": { "card": "Aang, Swift Savior // Aang and La, Ocean's Fury", "face": 0, "zones": ["battlefield"], "controller": "self" },
  "timing": "stack",
  "cost": {
    "mana": "{8}",
    "tap": { "choose": { "types": ["artifact", "creature"] }, "count": 8, "upTo": true, "pay": "generic", "keyword": "waterbend" }
  },
  "instructions": [{ "do": "transform", "what": "this" }]
}
```

The card still needs its standing front and back abilities. This example
prepares only its activation, not the airbend entry trigger or attack trigger.
