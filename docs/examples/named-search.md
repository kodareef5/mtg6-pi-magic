# Search by a previously chosen name

The evidence variant pays its additional cost before the spell resolves. The
ordinary variant omits that cost and contains only the destroy instruction.
The chosen graveyard card is not a target. Choosing follows the destruction,
so a creature destroyed by this spell can supply the name.

`nameOf` reads the names of the referenced object, including last known
information when needed. Objects share a name if any name matches (201.2a).
An empty reference matches nothing. It grants no permission to see hidden cards.

Searching grants a private look at all cards in the searched hidden zones
(701.23a). The look must include nonmatching cards too. Choosing any number
allows zero. The selected set moves in one group; `countFrom` binds the number
that came from the specified zone before the move. That amount survives the
shuffle and supplies the draw count. This example does not certify the model's
interpretation or implement sideboarding.

```json procedure
{
  "source": {
    "card": "Deadly Cover-Up",
    "zones": [
      "hand"
    ],
    "controller": "self"
  },
  "claim": "Deadly Cover-Up with evidence and a private name search",
  "basis": "As an additional cost to cast this spell, you may collect evidence 6.\nDestroy all creatures. If evidence was collected, exile a card from an opponent's graveyard. Then search its owner's graveyard, hand, and library for any number of cards with that name and exile them. That player shuffles, then draws a card for each card exiled from their hand this way.",
  "timing": "spell",
  "cost": {
    "exile": {
      "graveyard": {},
      "totalManaValue": 6
    }
  },
  "instructions": [
    {
      "do": "destroy",
      "every": {
        "types": [
          "creature"
        ]
      }
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "zones": [
          "graveyard"
        ],
        "owner": "opponent",
        "token": false
      },
      "count": 1,
      "as": "chosen"
    },
    {
      "do": "move",
      "what": "bound:chosen",
      "to": "exile",
      "reason": "exile",
      "as": "named"
    },
    {
      "do": "look",
      "who": "you",
      "every": {
        "zones": [
          "hand",
          "library"
        ],
        "owner": "owner:bound:named"
      },
      "if": {
        "bound": "named"
      }
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "zones": [
          "graveyard",
          "hand",
          "library"
        ],
        "owner": "owner:bound:named",
        "nameOf": "bound:named",
        "token": false
      },
      "count": {
        "count": {
          "zones": [
            "graveyard",
            "hand",
            "library"
          ],
          "owner": "owner:bound:named",
          "nameOf": "bound:named",
          "token": false
        }
      },
      "upTo": true,
      "as": "found"
    },
    {
      "do": "move",
      "what": "bound:found",
      "to": "exile",
      "reason": "exile",
      "countFrom": "hand",
      "as": "exiled"
    },
    {
      "do": "shuffle",
      "who": "owner:bound:named"
    },
    {
      "do": "draw",
      "who": "owner:bound:named",
      "count": {
        "bound": "exiled"
      }
    }
  ]
}
```
