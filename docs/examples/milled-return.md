# A card returned from a milled group

Cache Grab binds only cards moved by its own mill instruction. The selection
reads that group in the graveyard. After moving the chosen permanent to hand,
the binding follows its new incarnation and the Squirrel check explicitly reads
that hand zone. An omitted selector zone would mean battlefield and miss it.
A Squirrel already controlled is a separate battlefield check.

The optional return may choose nothing. These instructions do not search the
library or let the player select another card from the graveyard.

```json procedure
{
  "claim": "Cast Cache Grab: mill four cards, optionally return a permanent card milled this way to hand, and create a Food token if you control a Squirrel or returned a Squirrel card this way.",
  "basis": "Mill four cards. You may put a permanent card from among the cards milled this way into your hand. If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token. (To mill four cards, put the top four cards of your library into your graveyard. A Food token is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")",
  "source": {
    "card": "Cache Grab",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "timing": "spell",
  "cost": {
    "mana": "{1}{G}"
  },
  "instructions": [
    {
      "do": "mill",
      "who": "you",
      "count": 4,
      "as": "milled"
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "is": "bound:milled",
        "zones": [
          "graveyard"
        ],
        "types": [
          "artifact",
          "battle",
          "creature",
          "enchantment",
          "land",
          "planeswalker"
        ]
      },
      "count": 1,
      "upTo": true,
      "as": "returned"
    },
    {
      "do": "move",
      "what": "bound:returned",
      "to": "hand",
      "reason": "resolve"
    },
    {
      "do": "token",
      "count": 1,
      "spec": {
        "name": "Food Token",
        "types": [
          "artifact"
        ],
        "subtypes": [
          "Food"
        ],
        "colors": [],
        "registers": [
          {
            "basis": "{2}, {T}, Sacrifice this token: You gain 3 life.",
            "kind": "activated",
            "cost": {
              "mana": "{2}",
              "tap": true,
              "sacrifice": "this"
            },
            "effect": {
              "instructions": [
                {
                  "do": "life",
                  "who": "you",
                  "amount": 3
                }
              ]
            }
          }
        ]
      },
      "controller": "you",
      "if": {
        "any": [
          {
            "amount": {
              "count": {
                "subtypes": [
                  "Squirrel"
                ],
                "controller": "you"
              }
            },
            "atLeast": 1
          },
          {
            "is": "bound:returned",
            "matches": {
              "subtypes": [
                "Squirrel"
              ],
              "zones": [
                "hand"
              ]
            }
          }
        ]
      }
    }
  ]
}
```
