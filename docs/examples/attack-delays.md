# Attack triggers with separate sacrifice deadlines

Dalkovan Encampment creates a watch for each attack this turn, and each attack
creates its own delayed sacrifice. The attack watch expires at end of turn.
Each sacrifice watches the next end step without restricting its active player;
skipping an end step does not change that meaning.

The token binding belongs to its own delayed trigger. A later attack gets a
separate pair, and tokens that leave and return do not rejoin the old binding.
This example does not create an extra combat or skip a step.

```json procedure
{
  "claim": "Activate the encampment: pay {2}{W} and tap it to create a this-turn trigger that makes two tapped, attacking 1/1 red Warrior tokens whenever I attack, sacrificing them at the next end step.",
  "basis": "{2}{W}, {T}: Whenever you attack this turn, create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next end step.",
  "source": {
    "card": "Dalkovan Encampment",
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "timing": "stack",
  "cost": {
    "mana": "{2}{W}",
    "tap": true
  },
  "instructions": [
    {
      "do": "delay",
      "event": {
        "on": "attacked-with",
        "by": "you",
        "batch": true
      },
      "until": "end-of-turn",
      "effect": {
        "instructions": [
          {
            "do": "token",
            "count": 2,
            "spec": {
              "name": "Warrior Token",
              "types": [
                "creature"
              ],
              "subtypes": [
                "Warrior"
              ],
              "colors": [
                "R"
              ],
              "power": 1,
              "toughness": 1
            },
            "controller": "you",
            "tapped": true,
            "attacking": true,
            "as": "warriors"
          },
          {
            "do": "delay",
            "event": {
              "on": "step",
              "step": "end"
            },
            "effect": {
              "instructions": [
                {
                  "do": "move",
                  "what": "bound:warriors",
                  "to": "graveyard",
                  "reason": "sacrifice"
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```
