# Conditions over instruction groups

Esper Origins checks whether it was cast from a graveyard once, before exiling
and returning itself. Put that condition on a `perform` group. Each nested
instruction then runs in printed order without repeating the condition.

```json procedure
{
  "face": 0,
  "claim": "Esper Origins checks its graveyard cast before both moves",
  "basis": "Surveil 2. You gain 2 life. If this spell was cast from a graveyard, exile it, then put it onto the battlefield transformed under its owner's control with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)",
  "source": {
    "card": "Esper Origins // Summon: Esper Maduin",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "timing": "spell",
  "instructions": [
    {
      "do": "look",
      "who": "you",
      "what": {
        "top": 2,
        "of": "you"
      },
      "as": "surveil-window"
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "zones": [
          "library"
        ],
        "is": "bound:surveil-window"
      },
      "count": 2,
      "upTo": true,
      "as": "put-in-graveyard"
    },
    {
      "do": "move",
      "what": "bound:put-in-graveyard",
      "to": "graveyard",
      "reason": "mill"
    },
    {
      "do": "order",
      "who": "you",
      "every": {
        "zones": [
          "library"
        ],
        "is": "bound:surveil-window"
      },
      "position": "top"
    },
    {
      "do": "life",
      "who": "you",
      "amount": 2
    },
    {
      "do": "perform",
      "who": "you",
      "if": {
        "cast": "this",
        "by": "you",
        "from": "graveyard"
      },
      "instructions": [
        {
          "do": "move",
          "what": "this",
          "to": "exile",
          "reason": "exile",
          "as": "transformed"
        },
        {
          "do": "move",
          "what": "bound:transformed",
          "to": "battlefield",
          "face": 1,
          "controller": "owner:bound:transformed",
          "counters": {
            "finality": 1
          },
          "reason": "resolve"
        }
      ]
    }
  ]
}
```

The ordinary cast uses its printed cost. The same body can resolve a graveyard
cast through its accepted flashback permission, which supplies {3}{G} and the
stack departure replacement. This example does not grant that permission or
supply the back face's chapter registrations.

The exile binds the new incarnation as `transformed`; the return names that
binding and enters with the finality counter. A repeated `cast` condition on
the return would ask about an incarnation that was never cast. The binding
follows this procedure's own moves, not an unrelated move by another effect.
