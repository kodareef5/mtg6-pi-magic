# A combined selection limit

Michelangelo's Technique chooses up to two creatures whose total mana value is
at most six. Limiting each card to six would still offer an illegal pair.
`choose.totalManaValueAtMost` reads the sum of all selected cards and offers only
additions that fit. The question states the cap and the selected total.

The limit requires `upTo: true`. Zero, one and two remain the seat's choices;
a required exact count or a random selection with a group limit is not supported.
The cap can use any existing Amount, read during selection. Card values come
from characteristics, including the ordinary face of an Adventure in a library.

A prior `look` supplies the bounded private window. Movement enters the chosen
creatures together. The remaining looked-at cards, including unchosen creatures,
go to the bottom in random order. Neither selection nor listing options moves
cards, changes library order, or reveals the inspection to another seat.

```json procedure
{
  "source": {
    "card": "Michelangelo's Technique",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "claim": "Cast Michelangelo's Technique normally",
  "basis": "Look at the top eight cards of your library. Put up to two creature cards with total mana value 6 or less from among them onto the battlefield and the rest on the bottom of your library in a random order.",
  "timing": "spell",
  "instructions": [
    {
      "do": "look",
      "who": "you",
      "what": {
        "top": 8,
        "of": "you"
      },
      "as": "looked"
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "zones": [
          "library"
        ],
        "is": "bound:looked",
        "types": [
          "creature"
        ]
      },
      "count": 2,
      "upTo": true,
      "totalManaValueAtMost": 6,
      "as": "taken"
    },
    {
      "do": "move",
      "what": "bound:taken",
      "to": "battlefield",
      "controller": "you",
      "reason": "resolve"
    },
    {
      "do": "order",
      "who": "you",
      "every": {
        "zones": [
          "library"
        ],
        "is": "bound:looked"
      },
      "position": "bottom",
      "random": true
    }
  ]
}
```

Sneak retains the same effect. Its separate announcement pays the return cost,
checks for an unblocked attacker during its controller's declare-blockers step,
and grants the timing needed for this sorcery under 702.190a. It does not grant
permission to cast from an otherwise unpermitted zone.

```json procedure
{
  "source": {
    "card": "Michelangelo's Technique",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "claim": "Cast Michelangelo's Technique for sneak",
  "basis": "Sneak {3}{G} (You may cast this spell for {3}{G} if you also return an unblocked attacker you control to hand during the declare blockers step.) ... Look at the top eight cards of your library. Put up to two creature cards with total mana value 6 or less from among them onto the battlefield and the rest on the bottom of your library in a random order.",
  "timing": "spell",
  "instructions": [
    {
      "do": "look",
      "who": "you",
      "what": {
        "top": 8,
        "of": "you"
      },
      "as": "looked"
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "zones": [
          "library"
        ],
        "is": "bound:looked",
        "types": [
          "creature"
        ]
      },
      "count": 2,
      "upTo": true,
      "totalManaValueAtMost": 6,
      "as": "taken"
    },
    {
      "do": "move",
      "what": "bound:taken",
      "to": "battlefield",
      "controller": "you",
      "reason": "resolve"
    },
    {
      "do": "order",
      "who": "you",
      "every": {
        "zones": [
          "library"
        ],
        "is": "bound:looked"
      },
      "position": "bottom",
      "random": true
    }
  ],
  "speed": "instant",
  "if": {
    "all": [
      {
        "turn": "self"
      },
      {
        "step": "declare-blockers"
      }
    ]
  },
  "cost": {
    "mana": "{3}{G}",
    "alternative": "sneak",
    "return": {
      "choose": {
        "types": [
          "creature"
        ],
        "blocked": false
      },
      "count": 1
    }
  }
}
```
