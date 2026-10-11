# Plot as a special action

Plot pays its accepted mana cost and exiles a hand card without using the stack
(702.170a-b). Selecting the action and mana sources spends nothing until the
seat confirms. Cancelling returns to the same priority opportunity.

```json procedure
{
  "source": {
    "card": "Slickshot Show-Off",
    "zones": [
      "hand"
    ],
    "controller": "self"
  },
  "claim": "Plot Slickshot Show-Off",
  "basis": "Plot {1}{R} (You may pay {1}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
  "timing": "special",
  "special": "plot",
  "cost": {
    "mana": "{1}{R}"
  },
  "instructions": []
}
```

```json package
{
  "card": "Slickshot Show-Off",
  "printedCast": true,
  "registers": [
    {
      "basis": "Flying, haste",
      "kind": "continuous",
      "affects": {
        "is": "this"
      },
      "change": {
        "words": [
          "flying",
          "haste"
        ]
      }
    },
    {
      "basis": "Whenever you cast a noncreature spell, this creature gets +2/+0 until end of turn.",
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
              "power": 2,
              "toughness": 0
            }
          }
        ]
      }
    }
  ],
  "procedures": [
    {
      "source": {
        "card": "Slickshot Show-Off",
        "zones": [
          "hand"
        ],
        "controller": "self"
      },
      "claim": "Plot Slickshot Show-Off",
      "basis": "Plot {1}{R} (You may pay {1}{R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
      "timing": "special",
      "special": "plot",
      "cost": {
        "mana": "{1}{R}"
      },
      "instructions": []
    }
  ]
}
```

The exiled incarnation becomes plotted. Its owner may cast it for {0} on a
later turn, only in their main phase with an empty stack, regardless of flash
(702.170d). This alternative price keeps additional costs and cannot combine
with another alternative price. It survives loss of the plot ability, but
leaving exile ends this incarnation's permission. The later cast uses the usual
prepared spell and staged announcement; plotting is neither a cast nor an
activation and triggers neither event.

This form supports a fixed mana plot cost from hand. It does not support
nonmana plot costs, plot-cost reductions, permissions to plot from other zones
or effects that make another exiled card plotted. The resource forecast checks
the plot payment and stops there; it does not predict the later free cast.
Accepted syntax and paid resources do not certify the quoted interpretation.
