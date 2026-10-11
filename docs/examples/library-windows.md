# Simultaneous library windows

Doomsday Excruciator exiles all but the bottom six cards of each player's
library in one instruction. `exceptBottom` computes the window separately for
each library and combines the objects before moving them. A library with six
or fewer cards contributes no objects. Its order and each retained incarnation
stay unchanged. No player gains permission to look at the face-down cards.

`top` also accepts `of: "each-player"`. That names the same requested number
from each library, not one combined number across the table. Neither reference
grants a look. An `each` instruction would resolve the moves sequentially and
would misrepresent a simultaneous exile.

The entry trigger checks whether this incarnation was cast, both when the
trigger fires and when it resolves. Putting the creature directly onto the
battlefield does not exile libraries. Its ordinary upkeep draw is separate.

```json package
{
  "card": "Doomsday Excruciator",
  "registers": [
    {
      "basis": "Flying",
      "kind": "continuous",
      "affects": {
        "is": "this",
        "zones": [
          "battlefield",
          "stack"
        ]
      },
      "change": {
        "words": [
          "flying"
        ]
      }
    },
    {
      "basis": "When this creature enters, if it was cast, each player exiles all but the bottom six cards of their library face down.",
      "kind": "watch",
      "event": {
        "on": "enters",
        "of": {
          "is": "this"
        }
      },
      "if": {
        "cast": "this"
      },
      "effect": {
        "instructions": [
          {
            "do": "move",
            "what": {
              "exceptBottom": 6,
              "of": "each-player"
            },
            "to": "exile",
            "faceDown": true,
            "reason": "exile"
          }
        ]
      }
    },
    {
      "basis": "At the beginning of your upkeep, draw a card.",
      "kind": "watch",
      "event": {
        "on": "step",
        "step": "upkeep",
        "whose": "you"
      },
      "effect": {
        "instructions": [
          {
            "do": "draw",
            "who": "you",
            "count": 1
          }
        ]
      }
    }
  ],
  "procedures": [],
  "assessed": true,
  "printedCast": true,
  "deferred": []
}
```
