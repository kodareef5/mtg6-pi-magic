# Mana abilities

A mana ability is something a permanent can always do, so the permanent
registers it when it enters, in its package. The table then taps it while you
pay for something (601.2g). You never announce it on its own.

A basic land needs nothing: its land type gives it the ability (305.6).

```json package
{
  "card": "Llanowar Elves",
  "registers": [{ "basis": "{T}: Add {G}.", "kind": "mana", "cost": { "tap": true }, "colors": ["G"] }]
}
```

The Elves cannot tap the turn they arrive. The table applies summoning
sickness to a creature's tap abilities; you do not write it.

## "Or" is two registrations

"{T}: Add {W} or {U}" has two alternative outputs. Represent them with two
registrations sharing the same cost and basis. Each activation produces one
mana, and tapping the source prevents using its other alternative. By contrast,
`colors: ["W", "U"]` means adding both mana together. Deserted Beach and
Concealed Courtyard use the alternatives below with their own printed colors.

```json package
{
  "card": "Azorius Guildgate",
  "registers": [
    { "basis": "This land enters tapped.", "kind": "enters", "tapped": true },
    { "basis": "{T}: Add {W} or {U}.", "kind": "mana", "cost": { "tap": true }, "colors": ["W"] },
    { "basis": "{T}: Add {W} or {U}.", "kind": "mana", "cost": { "tap": true }, "colors": ["U"] }
  ]
}
```

## Counting, and "other"

`times` repeats the mana. Elvish Archdruid also shows the difference between
its two lines: the bonus is for *other* Elves, the mana counts *each* Elf,
itself included.

```json package
{
  "card": "Elvish Archdruid",
  "registers": [
    { "basis": "Other Elf creatures you control get +1/+1.", "kind": "continuous",
      "affects": { "types": ["creature"], "subtypes": ["Elf"], "controller": "you", "other": true },
      "change": { "power": 1, "toughness": 1 } },
    { "basis": "{T}: Add {G} for each Elf you control.", "kind": "mana", "cost": { "tap": true }, "colors": ["G"],
      "times": { "count": { "subtypes": ["Elf"], "controller": "you" } } }
  ]
}
```

## Mana with a restriction

`spendOnly` travels with the mana it makes. The table will only spend it on what
the selector matches, because you said so when you made it.

```json package
{
  "card": "Rockface Village",
  "registers": [
    { "basis": "{T}: Add {C}.", "kind": "mana", "cost": { "tap": true }, "colors": ["C"] },
    { "basis": "{T}: Add {R}. Spend this mana only to cast a creature spell.", "kind": "mana", "cost": { "tap": true }, "colors": ["R"],
      "spendOnly": { "zones": ["stack"], "types": ["creature"] } }
  ]
}
```

Rockface Village's third ability is announced, not registered; see
`until-end-of-turn.md`.

## A token's mana ability

A token carries its registrations in its spec. Smaug makes a Treasure from its
upkeep watch, and the Treasure registers its mana ability. Sacrificing it is
part of the cost, so the table moves it to the graveyard as you pay. Its text
comes from the rules (111.10a), not from Smaug's card.

```json package
{
  "card": "Smaug the Magnificent",
  "registers": [
    { "basis": "Flying, haste", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["flying", "haste"] } },
    { "basis": "Whenever Smaug attacks, he deals damage equal to the number of Treasures you control to any target.", "kind": "watch",
      "event": { "on": "attacks", "of": { "is": "this" } },
      "effect": { "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
        "instructions": [{ "do": "damage", "to": "target:0", "amount": { "count": { "subtypes": ["Treasure"], "controller": "you" } } }] } },
    { "basis": "At the beginning of your upkeep, create a Treasure token.", "kind": "watch",
      "event": { "on": "step", "step": "upkeep", "whose": "you" },
      "effect": { "instructions": [{ "do": "token", "count": 1, "spec": { "name": "Treasure", "types": ["artifact"], "subtypes": ["Treasure"], "colors": [],
        "registers": [{ "basis": "{T}, Sacrifice this token: Add one mana of any color.", "kind": "mana",
          "cost": { "tap": true, "sacrifice": "this" }, "any": 1 }] } }] } }
  ]
}
```

## A mana ability with a condition

A Verge's second ability works only while its controller holds a land of a
named type. Register it as `mana` with `if`; while the condition fails the
ability is not offered as a source.

```json package
{
  "card": "Gloomlake Verge",
  "registers": [
    { "basis": "{T}: Add {U}.", "kind": "mana", "cost": { "tap": true }, "colors": ["U"] },
    { "basis": "{T}: Add {B}. Activate only if you control an Island or a Swamp.", "kind": "mana", "cost": { "tap": true }, "colors": ["B"],
      "if": { "amount": { "count": { "types": ["land"], "subtypes": ["Island", "Swamp"], "controller": "you" } }, "atLeast": 1 } }
  ]
}
```

## A source that entered this turn

`enteredThisTurn` reads the current battlefield incarnation against the start
of the current turn, including an opponent's turn. Returning a card to the
battlefield supplies a new entry; changing control supplies none. A forecast
of the next turn cannot carry this turn's entry permission forward. This example
does not let the mana ability ignore its other costs or restrictions.

```json package
{
  "card": "Hidden Lair",
  "registers": [
    {
      "basis": "{T}: Add {C}.",
      "kind": "mana",
      "cost": {
        "tap": true
      },
      "colors": [
        "C"
      ]
    },
    {
      "basis": "{T}: Add {U} or {B}. Activate only if this land entered this turn or if you control a basic land.",
      "kind": "mana",
      "cost": {
        "tap": true
      },
      "colors": [
        "U"
      ],
      "if": {
        "any": [
          {
            "enteredThisTurn": "this"
          },
          {
            "amount": {
              "count": {
                "types": [
                  "land"
                ],
                "supertypes": [
                  "basic"
                ],
                "controller": "you"
              }
            },
            "atLeast": 1
          }
        ]
      }
    },
    {
      "basis": "{T}: Add {U} or {B}. Activate only if this land entered this turn or if you control a basic land.",
      "kind": "mana",
      "cost": {
        "tap": true
      },
      "colors": [
        "B"
      ],
      "if": {
        "any": [
          {
            "enteredThisTurn": "this"
          },
          {
            "amount": {
              "count": {
                "types": [
                  "land"
                ],
                "supertypes": [
                  "basic"
                ],
                "controller": "you"
              }
            },
            "atLeast": 1
          }
        ]
      }
    }
  ]
}
```
