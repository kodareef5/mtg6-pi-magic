# Costs

A cost is everything paid as an action is announced, before it goes on the
stack (601.2h). `mana` is the mana symbols; the other parts are motions the
table makes as you pay: `tap`, `sacrifice`, `exile`, `life`, `discard`,
`counters`. Partial payment is not allowed, so the table offers an action only
when the whole cost can be paid.

## Sacrifice, with last known information

Heartfire Immolator sacrifices itself and then uses its power. The power is read
as it last existed on the battlefield (608.2h), so prowess pumps still count.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Heartfire Immolator" },
  "claim": "Sacrifice Heartfire Immolator for damage equal to its power",
  "basis": "{R}, Sacrifice this creature: It deals damage equal to its power to target creature or planeswalker.",
  "timing": "stack",
  "cost": { "mana": "{R}", "sacrifice": "this" },
  "targets": [{ "object": { "types": ["creature", "planeswalker"] } }],
  "instructions": [{ "do": "damage", "to": "target:0", "amount": { "power": "this" }, "from": "this" }]
}
```

## A selected sacrifice's last known information

`cost.sacrifice.as` binds the selected permanents as they were before paying.
Resolution can read their mana value, power, toughness and counters through
last known information. The old references cannot move their new graveyard
incarnations. No value is stored in place of the source reference, and choosing
an announcement never pays the sacrifice before confirmation.

Repurposing Bay reads the artifact sacrificed to its own cost, independently
of other sacrifices or a later move of that card. Its constrained library
search may fail to find; the library is still shuffled. The source and cost
selection must name another controlled artifact. These terms do not establish
that an arbitrary card permits the stated sacrifice or search.

```json procedure
{
  "source": {
    "card": "Repurposing Bay",
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "claim": "Repurpose an artifact into one costing one more",
  "basis": "{2}, {T}, Sacrifice another artifact: Search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.",
  "timing": "stack",
  "speed": "sorcery",
  "cost": {
    "mana": "{2}",
    "tap": true,
    "sacrifice": {
      "choose": {
        "types": [
          "artifact"
        ],
        "controller": "you",
        "other": true
      },
      "count": 1,
      "as": "paid-artifact"
    }
  },
  "instructions": [
    {
      "do": "choose",
      "who": "you",
      "from": {
        "zones": [
          "library"
        ],
        "owner": "you",
        "types": [
          "artifact"
        ],
        "manaValue": {
          "atLeast": {
            "sum": [
              1,
              {
                "manaValue": "bound:paid-artifact"
              }
            ]
          },
          "atMost": {
            "sum": [
              1,
              {
                "manaValue": "bound:paid-artifact"
              }
            ]
          }
        }
      },
      "count": 1,
      "upTo": true,
      "as": "found"
    },
    {
      "do": "move",
      "what": "bound:found",
      "to": "battlefield",
      "controller": "you",
      "reason": "resolve"
    },
    {
      "do": "shuffle",
      "who": "you"
    }
  ]
}
```

## Discarding or exiling the card itself

An ability that works from your hand or graveyard names that zone in `source`.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Kree Sentinel" },
  "claim": "Basic landcycling: Kree Sentinel for a basic land",
  "basis": "Basic landcycling {2} ({2}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)",
  "timing": "stack",
  "cost": { "mana": "{2}", "discard": "this" },
  "instructions": [
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "reveal": true, "as": "land" },
    { "do": "move", "what": "bound:land", "to": "hand", "reason": "resolve" },
    { "do": "shuffle", "who": "you" }
  ]
}
```

```json procedure
{
  "source": { "zones": ["graveyard"], "controller": "self", "card": "Adorned Crocodile" },
  "claim": "Renew Adorned Crocodile onto a creature",
  "basis": "Renew — {B}, Exile this card from your graveyard: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
  "timing": "stack",
  "speed": "sorcery",
  "cost": { "mana": "{B}", "exile": "this" },
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [{ "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 }]
}
```

## Life

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Elven Passage" },
  "claim": "Crack Elven Passage for a basic land",
  "basis": "{T}, Pay 1 life, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. You may behold an Elf. If you do, untap that land.",
  "timing": "stack",
  "cost": { "tap": true, "life": 1, "sacrifice": "this" },
  "instructions": [
    { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "as": "land" },
    { "do": "move", "what": "bound:land", "to": "battlefield", "tapped": true, "reason": "resolve" },
    { "do": "shuffle", "who": "you" },
    { "do": "choose", "who": "you", "from": { "zones": ["battlefield", "hand"], "controller": "you", "subtypes": ["Elf"] }, "count": 1, "reveal": true, "may": true, "as": "elf" },
    { "do": "untap", "what": "bound:land", "if": { "bound": "elf" } }
  ]
}
```

Beholding is choosing an Elf you control or revealing one from your hand.

## Reductions

A reduction is an amount, worked out as the cost is locked (601.2f). Never write
the reduced number yourself.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Witchstalker Frenzy" },
  "claim": "Cast Witchstalker Frenzy",
  "basis": "This spell costs {1} less to cast for each creature that attacked this turn. ... Witchstalker Frenzy deals 5 damage to target creature.",
  "timing": "spell",
  "cost": { "reduce": { "history": "attacked" } },
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [{ "do": "damage", "to": "target:0", "amount": 5 }]
}
```

Affinity for Forests is `{"reduce": {"count": {"subtypes": ["Forest"], "controller": "you"}}}`.
