# Amass after destruction

Azog destroys first, then the target's controller amasses using its last known
power. Its draw condition also needs last known information if the creature
left. `is` with `lastKnown: true` reads that exact departed incarnation when
it has no live object. Omitting the field asks about a live incarnation.

```json package
{
  "card": "Azog, Moria's Ruin",
  "registers": [
    {
      "kind": "watch",
      "basis": "When Azog enters, destroy up to one other target creature. Its controller amasses Goblins X, where X is that creature's power. If you controlled that creature, draw a card. (To amass Goblins X, that player puts X +1/+1 counters on an Army they control. It's also a Goblin. If they don't control an Army, they create a 0/0 black Goblin Army creature token first.)",
      "event": {
        "on": "enters",
        "of": {
          "is": "this"
        }
      },
      "effect": {
        "targets": [
          {
            "object": {
              "types": [
                "creature"
              ],
              "other": true
            },
            "upTo": true
          }
        ],
        "instructions": [
          {
            "do": "perform",
            "who": "you",
            "if": {
              "is": "target:0",
              "matches": {
                "types": [
                  "creature"
                ]
              }
            },
            "instructions": [
              {
                "do": "destroy",
                "what": "target:0"
              },
              {
                "do": "token",
                "count": 1,
                "controller": "controller:target:0",
                "spec": {
                  "name": "Goblin Army",
                  "types": [
                    "creature"
                  ],
                  "subtypes": [
                    "Goblin",
                    "Army"
                  ],
                  "colors": [
                    "B"
                  ],
                  "power": 0,
                  "toughness": 0
                },
                "if": {
                  "amount": {
                    "count": {
                      "types": [
                        "creature"
                      ],
                      "subtypes": [
                        "Army"
                      ],
                      "controller": "controller:target:0"
                    }
                  },
                  "atMost": 0
                }
              },
              {
                "do": "choose",
                "who": "controller:target:0",
                "from": {
                  "types": [
                    "creature"
                  ],
                  "subtypes": [
                    "Army"
                  ],
                  "controller": "controller:target:0"
                },
                "count": 1,
                "as": "army"
              },
              {
                "do": "counters",
                "on": "bound:army",
                "kind": "+1/+1",
                "amount": {
                  "power": "target:0"
                },
                "if": {
                  "amount": {
                    "power": "target:0"
                  },
                  "atLeast": 1
                }
              },
              {
                "do": "modify",
                "what": "bound:army",
                "until": "indefinite",
                "change": {
                  "subtypes": {
                    "add": [
                      "Goblin"
                    ]
                  }
                }
              },
              {
                "do": "draw",
                "who": "you",
                "count": 1,
                "if": {
                  "is": "target:0",
                  "matches": {
                    "controller": "you"
                  },
                  "lastKnown": true
                }
              }
            ]
          }
        ]
      }
    }
  ],
  "procedures": [],
  "assessed": true,
  "printedCast": true
}
```

A target illegal when resolution begins supplies neither a live object nor
last known information to this effect. The condition does not make a departed
object movable. Core retains the recorded controller and layered power; it
never finds the new graveyard incarnation by card name.

The new Army stays 0/0 until the counters are placed in this resolution. State
based actions wait for resolution to finish. An existing Army keeps its other
creature types and also becomes a Goblin. The target's controller chooses the
Army, including when another player owns the destroyed creature.
