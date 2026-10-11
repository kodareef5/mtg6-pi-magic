# Cast facts

Mana value comes from a spell's printed cost and selected face, including X
while on the stack. Kicker, reductions and alternative costs change what is
paid, not this value. Colors include both colors of a hybrid symbol before
anyone chooses how to pay. These facts do not prepare hybrid payment.

An identified deferred cast may use these selectors when interpreted. Source
coverage and syntax acceptance do not certify that the interpretation is legal.

## Actual casting payment

This is Dyadrine's entry term only. The attack trigger and chosen-X cast remain
separate preparation. Mana spent comes from the recorded payment, including
floating mana and abilities used while paying. Casting it with X equal to two
normally supplies four counters; a reduction of two supplies two. Putting it
onto the battlefield without casting it supplies none.

```json package
{
  "card": "Dyadrine, Synthesis Amalgam",
  "registers": [{
    "kind": "enters",
    "basis": "Dyadrine enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it.",
    "counters": { "+1/+1": { "manaSpent": "this" } }
  }]
}
```

`colorsSpent` counts distinct colors of that same payment, excluding colorless.
`manaSpent` with `color: "W"` counts white mana. Neither substitutes mana value
or the unreduced price for what the player actually spent. `{cast: "this", by:
"you"}` retains who cast the permanent across resolution and ends on a later
zone change.

## Selecting a spell

Disdainful Stroke reads the spell on the stack, including its X.

```json procedure
{
  "source": { "card": "Disdainful Stroke", "zones": ["hand"], "controller": "self" },
  "claim": "Counter a spell with mana value at least four",
  "basis": "Counter target spell with mana value 4 or greater.",
  "timing": "spell",
  "targets": [{ "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "planeswalker", "sorcery"], "manaValue": { "atLeast": 4 } } }],
  "instructions": [{ "do": "counter", "what": "target:0" }]
}
```

Flashfreeze uses a color union. A multicolored spell is red or green if it has
either listed color. `colors: []` means colorless; `not.colors: ["U"]` means
not blue. C names a mana type, not a color.

```json procedure
{
  "source": { "card": "Flashfreeze", "zones": ["hand"], "controller": "self" },
  "claim": "Counter a red or green spell",
  "basis": "Counter target red or green spell.",
  "timing": "spell",
  "targets": [{ "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "planeswalker", "sorcery"], "colors": ["R", "G"] } }],
  "instructions": [{ "do": "counter", "what": "target:0" }]
}
```

## Watching casts

This is Scalding Viper's standing front ability only. Its ordinary creature
cast and Steam Clean use inventory are separate preparation.

```json package
{
  "card": "Scalding Viper // Steam Clean",
  "registers": [{
    "face": 0,
    "kind": "watch",
    "basis": "Whenever an opponent casts a spell with mana value 3 or less, this creature deals 1 damage to that player.",
    "event": { "on": "cast", "by": "opponent", "of": { "zones": ["stack"], "manaValue": { "atMost": 3 } } },
    "effect": { "instructions": [{ "do": "damage", "to": "event:player", "amount": 1 }] }
  }]
}
```

Thor's cast trigger reads the old stack incarnation even if someone counters
that spell before the trigger resolves. This partial package leaves flying and
Thor's entry trigger unprepared. In particular, it supplies no play permission.

```json package
{
  "card": "Thor, God of Thunder",
  "registers": [{
    "kind": "watch",
    "basis": "Whenever you cast a noncreature spell, Thor deals damage equal to that spell's mana value to any target.",
    "event": { "on": "cast", "by": "you", "of": { "zones": ["stack"], "not": { "types": ["creature"] } } },
    "effect": {
      "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
      "instructions": [{ "do": "damage", "to": "target:0", "amount": { "manaValue": "event:object" } }]
    }
  }]
}
```

## A computed bound

Bounds read the current amount. Day of Black Sun uses the X announced for this
cast; Moseo can use `{history: "life-gained", by: "you"}` instead. Neither
stores a derived value on a card.

```json procedure
{
  "source": { "card": "Day of Black Sun", "zones": ["hand"], "controller": "self" },
  "claim": "Remove abilities and destroy small creatures",
  "basis": "Each creature with mana value X or less loses all abilities until end of turn. Destroy those creatures.",
  "timing": "spell",
  "instructions": [
    { "do": "modify", "every": { "types": ["creature"], "manaValue": { "atMost": { "x": true } } }, "until": "end-of-turn", "change": { "loseAbilities": true }, "as": "small" },
    { "do": "destroy", "what": "bound:small" }
  ]
}
```
