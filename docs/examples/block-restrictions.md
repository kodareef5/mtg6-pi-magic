# Blocking restrictions

`prohibit.block` names an attacker selector and a blocker selector. A pair
matching both conflicts with that source-backed restriction. Both selectors
read the registration's source, so `power: this` is Otter's current layered
power in this example.

```json package
{
  "card": "Elusive Otter // Grove's Bounty",
  "printedCast": true,
  "registers": [
    {
      "face": 0,
      "basis": "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)",
      "kind": "watch",
      "event": {
        "on": "cast",
        "by": "you",
        "of": {
          "zones": [
            "stack"
          ],
          "not": {
            "types": [
              "creature"
            ]
          }
        }
      },
      "effect": {
        "instructions": [
          {
            "do": "modify",
            "what": "this",
            "until": "end-of-turn",
            "change": {
              "power": 1,
              "toughness": 1
            }
          }
        ]
      }
    },
    {
      "face": 0,
      "basis": "Creatures with power less than this creature's power can't block it.",
      "kind": "prohibit",
      "block": {
        "attacker": {
          "is": "this"
        },
        "blocker": {
          "types": [
            "creature"
          ],
          "power": {
            "atMost": {
              "sum": [
                {
                  "power": "this"
                },
                -1
              ]
            }
          }
        }
      }
    }
  ],
  "deferred": [
    {
      "face": 1,
      "claim": "Cast Grove's Bounty",
      "basis": "Distribute X +1/+1 counters among any number of target creatures you control. (Then exile this card. You may cast the creature later from exile.)",
      "source": {
        "card": "Elusive Otter // Grove's Bounty",
        "zones": [
          "hand",
          "graveyard",
          "exile"
        ],
        "controller": "any"
      },
      "timing": "spell"
    }
  ]
}
```

Power is an integer. At most Otter's power minus one expresses strictly less;
a blocker with equal power is allowed. Counters and temporary prowess changes
are read again each time, and losing Otter's abilities removes the restriction.

Core marks the conflicting block and keeps it available as a physical choice.
The strategy lookup, blocking forecast and post-declaration review use the
same pair check with each viewer's projected facts. A player can object to an
illegal declaration. These checks do not choose blockers or certify a model's
interpretation. Group requirements such as a minimum combined blocking power
need a separate complete-declaration rule; this pair selector cannot express them.

## Realm of Koh's Spirit

Two pair restrictions cover the token in both roles. A non-Spirit cannot block
it, and it cannot block a non-Spirit. Two Spirits may block each other.
These are registrations on the token; putting their text in `words` would
not implement them. Losing the token's abilities removes both restrictions.

```json procedure
{
  "source": {
    "card": "Realm of Koh",
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "claim": "Create a Spirit with its non-Spirit blocking restrictions",
  "basis": "{3}{B}, {T}: Create a 1/1 colorless Spirit creature token with \"This token can't block or be blocked by non-Spirit creatures.\"",
  "timing": "stack",
  "cost": {
    "mana": "{3}{B}",
    "tap": true
  },
  "instructions": [
    {
      "do": "token",
      "count": 1,
      "spec": {
        "name": "Spirit Token",
        "types": [
          "creature"
        ],
        "subtypes": [
          "Spirit"
        ],
        "colors": [],
        "power": 1,
        "toughness": 1,
        "registers": [
          {
            "kind": "prohibit",
            "basis": "This token can't block or be blocked by non-Spirit creatures.",
            "block": {
              "attacker": {
                "is": "this"
              },
              "blocker": {
                "types": [
                  "creature"
                ],
                "not": {
                  "subtypes": [
                    "Spirit"
                  ]
                }
              }
            }
          },
          {
            "kind": "prohibit",
            "basis": "This token can't block or be blocked by non-Spirit creatures.",
            "block": {
              "attacker": {
                "types": [
                  "creature"
                ],
                "not": {
                  "subtypes": [
                    "Spirit"
                  ]
                }
              },
              "blocker": {
                "is": "this"
              }
            }
          }
        ]
      }
    }
  ]
}
```
