# Targets with counters

A selector's `counters` maps each named kind to a range. Every named range must
match, and an absent kind counts as zero. The same predicate checks the target
at announcement and as resolution begins. It does not add or remove a counter.
If the only target becomes illegal, none of the ability resolves (608.2b).

Drowner moves the two permanents together, then shuffles each affected owner
once. The owner checks read the old battlefield incarnations. Its own library
still shuffles if Drowner left in response (701.24c). It may target itself when
it has a stun counter; that moves one object and shuffles one library.

```json procedure
{
  "claim": "Activate Floodpits Drowner on a creature with a stun counter",
  "basis": "{1}{U}, {T}: Shuffle this creature and target creature with a stun counter on it into their owners' libraries.",
  "source": {
    "card": "Floodpits Drowner",
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "timing": "stack",
  "cost": {
    "mana": "{1}{U}",
    "tap": true
  },
  "targets": [
    {
      "object": {
        "types": [
          "creature"
        ],
        "counters": {
          "stun": {
            "atLeast": 1
          }
        }
      }
    }
  ],
  "instructions": [
    {
      "do": "move",
      "every": {
        "any": [
          {
            "is": "this"
          },
          {
            "is": "target:0"
          }
        ]
      },
      "to": "library",
      "reason": "resolve"
    },
    {
      "do": "shuffle",
      "who": "owner:this"
    },
    {
      "do": "shuffle",
      "who": "owner:target:0",
      "if": {
        "not": {
          "is": "target:0",
          "matches": {
            "zones": [
              "battlefield"
            ],
            "owner": "owner:this"
          },
          "lastKnown": true
        }
      }
    }
  ]
}
```

This prepares the activation. The creature still needs its flash, vigilance
and entry-trigger registrations, plus its ordinary flash cast.
