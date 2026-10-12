# Rules imposed by resolving effects

Braided Net prevents activation on the affected incarnation without granting it
an ability. Removing either permanent's abilities or removing the Net does not
end that rule. Its first actual untap ends the rule permanently. A stun counter
that replaces untapping leaves the duration running; tapping it again after an
actual untap does not restore the restriction. Craft is a sorcery activation.
The Quipu back-face activation remains separate deferred work.

Torch the Tower uses the same independent rule record for its death replacement,
on only the permanents actually dealt damage by that resolution. Prevention can
leave no affected object. Losing abilities does not remove this replacement;
cleanup and a zone change do. These examples do not choose the order of multiple
competing death replacements.

```json package
{
  "card": "Braided Net // Braided Quipu",
  "registers": [
    {
      "face": 0,
      "basis": "This artifact enters with three net counters on it.",
      "kind": "enters",
      "counters": {
        "net": 3
      }
    }
  ]
}
```

```json procedure
{
  "face": 0,
  "claim": "Tap another nonland permanent and prevent its activated abilities from being activated for as long as it remains tapped.",
  "basis": "{T}, Remove a net counter from this artifact: Tap another target nonland permanent. Its activated abilities can't be activated for as long as it remains tapped.",
  "source": {
    "card": "Braided Net // Braided Quipu",
    "face": 0,
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "timing": "stack",
  "cost": {
    "tap": true,
    "counters": {
      "kind": "net",
      "count": 1
    }
  },
  "targets": [
    {
      "object": {
        "zones": [
          "battlefield"
        ],
        "not": {
          "types": [
            "land"
          ]
        },
        "other": true
      }
    }
  ],
  "instructions": [
    {
      "do": "tap",
      "what": "target:0"
    },
    {
      "do": "rule",
      "on": "target:0",
      "rule": {
        "activate": false
      },
      "until": "while-tapped"
    }
  ]
}
```

```json procedure
{
  "face": 0,
  "claim": "Craft with an artifact to return this card transformed as Braided Quipu.",
  "basis": "Craft with artifact {1}{U}",
  "source": {
    "card": "Braided Net // Braided Quipu",
    "face": 0,
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "timing": "stack",
  "cost": {
    "mana": "{1}{U}",
    "exile": {
      "choose": {
        "any": [
          {
            "zones": [
              "battlefield"
            ],
            "types": [
              "artifact"
            ],
            "controller": "you",
            "other": true
          },
          {
            "zones": [
              "graveyard"
            ],
            "types": [
              "artifact"
            ],
            "owner": "you"
          }
        ]
      },
      "count": 1,
      "source": true
    }
  },
  "instructions": [
    {
      "do": "move",
      "what": "bound:cost-source",
      "to": "battlefield",
      "face": 1,
      "reason": "resolve"
    }
  ],
  "speed": "sorcery"
}
```

```json procedure
{
  "claim": "Cast Torch the Tower without bargaining: deal 2 damage to target creature or planeswalker and create its damage-linked exile replacement for this turn.",
  "basis": "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nTorch the Tower deals 2 damage to target creature or planeswalker. If this spell was bargained, instead it deals 3 damage to that permanent and you scry 1.\nIf a permanent dealt damage by Torch the Tower would die this turn, exile it instead.",
  "source": {
    "card": "Torch the Tower",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "timing": "spell",
  "targets": [
    {
      "object": {
        "types": [
          "creature",
          "planeswalker"
        ]
      }
    }
  ],
  "instructions": [
    {
      "do": "damage",
      "to": "target:0",
      "amount": 2,
      "as": "damaged"
    },
    {
      "do": "rule",
      "on": "bound:damaged",
      "rule": {
        "diesTo": "exile"
      },
      "until": "end-of-turn"
    }
  ]
}
```

```json procedure
{
  "claim": "Cast Torch the Tower bargained, sacrificing an artifact, enchantment, or token as an additional cost: deal 3 damage to target creature or planeswalker, scry 1, and create its damage-linked exile replacement for this turn.",
  "basis": "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nTorch the Tower deals 2 damage to target creature or planeswalker. If this spell was bargained, instead it deals 3 damage to that permanent and you scry 1.\nIf a permanent dealt damage by Torch the Tower would die this turn, exile it instead.",
  "source": {
    "card": "Torch the Tower",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "timing": "spell",
  "cost": {
    "sacrifice": {
      "choose": {
        "any": [
          {
            "types": [
              "artifact"
            ],
            "controller": "you"
          },
          {
            "types": [
              "enchantment"
            ],
            "controller": "you"
          },
          {
            "token": true,
            "controller": "you"
          }
        ]
      },
      "count": 1
    }
  },
  "targets": [
    {
      "object": {
        "types": [
          "creature",
          "planeswalker"
        ]
      }
    }
  ],
  "instructions": [
    {
      "do": "damage",
      "to": "target:0",
      "amount": 3,
      "as": "damaged"
    },
    {
      "do": "keyword",
      "name": "scry",
      "who": "you",
      "count": 1
    },
    {
      "do": "rule",
      "on": "bound:damaged",
      "rule": {
        "diesTo": "exile"
      },
      "until": "end-of-turn"
    }
  ]
}
```

