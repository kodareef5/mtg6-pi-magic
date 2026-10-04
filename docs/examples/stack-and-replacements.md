# Countering, ward, replacements, and rules for everyone

## Countering a spell

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Cancel" },
  "claim": "Cast Cancel",
  "basis": "Counter target spell.",
  "timing": "spell",
  "targets": [{ "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "planeswalker", "sorcery"] } }],
  "instructions": [{ "do": "counter", "what": "target:0" }]
}
```

## Ward

Ward is a trigger on being targeted by an opponent: counter that spell or ability
unless its controller pays. `event:source` is the spell or ability that targeted,
and `event:player` its controller.

```json package
{
  "card": "Hulking Raptor",
  "registers": [
    { "basis": "Ward {2}", "kind": "watch",
      "event": { "on": "targeted", "of": { "is": "this" }, "by": "opponent" },
      "effect": { "instructions": [{ "do": "counter", "what": "event:source", "unless": { "who": "event:player", "pays": { "mana": "{2}" } } }] } },
    { "basis": "At the beginning of your first main phase, add {G}{G}.", "kind": "watch",
      "event": { "on": "step", "step": "precombat-main", "whose": "you" },
      "effect": { "instructions": [{ "do": "mana", "who": "you", "colors": ["G", "G"] }] } }
  ]
}
```

## A replacement placed by a spell

"If that creature would die this turn, exile it instead" is a replacement the
spell leaves on the creature. `register` puts it there, and it ends with the
turn.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Bot Bashing Time" },
  "claim": "Cast Bot Bashing Time",
  "basis": "Bot Bashing Time deals 6 damage to target creature. If that creature would die this turn, exile it instead.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [
    { "do": "register", "on": "target:0", "registration": { "basis": "If that creature would die this turn, exile it instead.", "kind": "replace", "on": "dies", "to": "exile", "until": "end-of-turn" } },
    { "do": "damage", "to": "target:0", "amount": 6 }
  ]
}
```

The replacement is registered before the damage, so it is already there when
the creature dies in the state check after resolution. The order of the card's
sentences is not always the order of the motions.

A target can depend on an earlier one. Fiery Annihilation's second target is
`{"object": {"subtypes": ["Equipment"], "attachedTo": "target:0"}, "upTo": true}`.

## Rules for every player, and repeating for each player

"Players can't gain life" and "Damage can't be prevented" are words on the
permanent. The table records them for the players and the judge. `each` repeats
its instructions for every player, binding `bound:player`.

```json package
{
  "card": "Sunspine Lynx",
  "registers": [
    { "basis": "Players can't gain life.", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["players can't gain life"] } },
    { "basis": "Damage can't be prevented.", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["damage can't be prevented"] } },
    { "basis": "When this creature enters, it deals damage to each player equal to the number of nonbasic lands that player controls.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "each", "players": "each-player", "instructions": [
        { "do": "damage", "to": "bound:player", "from": "this",
          "amount": { "count": { "types": ["land"], "not": { "supertypes": ["basic"] }, "controller": "bound:player" } } }
      ] }] } }
  ]
}
```

## Events that don't trigger

```json package
{
  "card": "Torpor Orb",
  "registers": [
    { "basis": "Creatures entering don't cause abilities to trigger.", "kind": "suppress", "event": { "on": "enters", "of": { "types": ["creature"] } } }
  ]
}
```
