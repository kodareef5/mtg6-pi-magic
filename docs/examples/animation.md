# Becoming something else

An effect that turns a permanent into a creature, or changes its types, is a
`modify`. Add the creature type, set its base power and toughness (layer 7b),
and add any words. Counters and other bonuses still apply on top (7c).

## Crew

Crew is a cost of tapping other creatures with total power N or more. The
Vehicle becomes a creature until end of turn.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Debris Beetle" },
  "claim": "Crew Debris Beetle",
  "basis": "Crew 2",
  "timing": "stack",
  "cost": { "tap": { "choose": { "types": ["creature"], "controller": "you", "other": true }, "totalPower": 2 } },
  "instructions": [{ "do": "modify", "what": "this", "until": "end-of-turn", "change": { "types": { "add": ["creature"] } } }]
}
```

A Vehicle has printed power and toughness, so it needs no `base`. Its static and
enters abilities are registered as usual:

```json package
{
  "card": "Debris Beetle",
  "registers": [
    { "basis": "Trample", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["trample"] } },
    { "basis": "When this Vehicle enters, each opponent loses 3 life and you gain 3 life.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "life", "who": "opponent", "amount": -3 }, { "do": "life", "who": "you", "amount": 3 }] } }
  ]
}
```

## A land that becomes a creature for good

No duration means the effect lasts until the land leaves (611.2a), so it is
`indefinite`. "All creature types" makes it every creature subtype at once.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Soulstone Sanctuary" },
  "claim": "Animate Soulstone Sanctuary",
  "basis": "{4}: This land becomes a 3/3 creature with vigilance and all creature types. It's still a land.",
  "timing": "stack",
  "cost": { "mana": "{4}" },
  "instructions": [{ "do": "modify", "what": "this", "until": "indefinite", "change": {
    "types": { "add": ["creature"] }, "subtypes": { "allCreatureTypes": true }, "base": { "power": 3, "toughness": 3 }, "words": ["vigilance"] } }]
}
```

The table treats a permanent that becomes a creature this turn by the clock it
entered, not by when it became a creature: a land you controlled since your turn
began can attack the turn it animates.

## Earthbend

Earthbend N is three motions: make the land a 0/0 creature with haste, put N
+1/+1 counters on it, and leave a delayed trigger to return it when it dies or is
exiled (701.66). The delayed trigger belongs to the table, not to the land, so it
fires even when the land itself is gone.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Ba Sing Se" },
  "claim": "Earthbend 2 with Ba Sing Se",
  "basis": "{2}{G}, {T}: Earthbend 2. Activate only as a sorcery. (Target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
  "timing": "stack",
  "speed": "sorcery",
  "cost": { "mana": "{2}{G}", "tap": true },
  "targets": [{ "object": { "types": ["land"], "controller": "you" } }],
  "instructions": [
    { "do": "modify", "what": "target:0", "until": "indefinite", "change": { "types": { "add": ["creature"] }, "base": { "power": 0, "toughness": 0 }, "words": ["haste"] } },
    { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 2 },
    { "do": "delay", "event": { "on": "leaves", "of": { "is": "target:0" }, "to": ["graveyard", "exile"] },
      "effect": { "instructions": [{ "do": "move", "what": "event:object", "to": "battlefield", "tapped": true, "controller": "you", "reason": "resolve" }] } }
  ]
}
```

## Changing what a creature is

Kellan's abilities check what it is now, then replace its creature subtypes
and grant abilities. `subtypes.set` with `of: "creature"` replaces only the
creature subtypes. A granted ability is a registration inside the change.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Kellan, Planar Trailblazer" },
  "claim": "Kellan becomes a Detective",
  "basis": "{1}{R}: If Kellan is a Scout, it becomes a Human Faerie Detective and gains \"Whenever Kellan deals combat damage to a player, exile the top card of your library. You may play that card this turn.\"",
  "timing": "stack",
  "cost": { "mana": "{1}{R}" },
  "instructions": [{ "do": "modify", "what": "this", "until": "indefinite",
    "if": { "is": "this", "matches": { "subtypes": ["Scout"] } },
    "change": { "subtypes": { "set": ["Human", "Faerie", "Detective"], "of": "creature" },
      "registers": [{ "basis": "Whenever Kellan deals combat damage to a player, exile the top card of your library. You may play that card this turn.", "kind": "watch",
        "event": { "on": "combat-damage", "of": { "is": "this" }, "player": true },
        "effect": { "instructions": [
          { "do": "move", "what": { "top": 1, "of": "you" }, "to": "exile", "reason": "exile", "as": "card" },
          { "do": "permit", "what": "bound:card", "who": "you", "until": "end-of-turn" }
        ] } }] } }]
}
```

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Kellan, Planar Trailblazer" },
  "claim": "Kellan becomes a Rogue with double strike",
  "basis": "{2}{R}: If Kellan is a Detective, it becomes a 3/2 Human Faerie Rogue and gains double strike.",
  "timing": "stack",
  "cost": { "mana": "{2}{R}" },
  "instructions": [{ "do": "modify", "what": "this", "until": "indefinite",
    "if": { "is": "this", "matches": { "subtypes": ["Detective"] } },
    "change": { "subtypes": { "set": ["Human", "Faerie", "Rogue"], "of": "creature" }, "base": { "power": 3, "toughness": 2 }, "words": ["double strike"] } }]
}
```

The second change keeps the first one's granted trigger: it sets subtypes and
base, and removes nothing.
