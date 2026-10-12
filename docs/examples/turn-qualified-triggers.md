# Turn-qualified departures

Suki, Courageous Rescuer creates an Ally when another permanent its controller
controls leaves during that controller's turn. `triggerIf` checks the turn
when the departure occurs. `event.whose` does not carry that fact for a
departure event.

The watcher reads the battlefield before the departure group. It therefore
sees another permanent leave alongside Suki. Two departures in that group
still use the once-per-turn trigger only once. Later departures that turn
create no additional trigger. Suki's static bonus affects the Ally only while
Suki remains on the battlefield.

```json package
{
  "card": "Suki, Courageous Rescuer",
  "registers": [
    {
      "basis": "Other creatures you control get +1/+0.",
      "kind": "continuous",
      "affects": {
        "types": [
          "creature"
        ],
        "controller": "you",
        "other": true
      },
      "change": {
        "power": 1,
        "toughness": 0
      }
    },
    {
      "basis": "Whenever another permanent you control leaves the battlefield during your turn, create a 1/1 white Ally creature token. This ability triggers only once each turn.",
      "kind": "watch",
      "event": {
        "on": "leaves",
        "of": {
          "zones": [
            "battlefield"
          ],
          "controller": "you",
          "other": true
        },
        "from": [
          "battlefield"
        ]
      },
      "limit": "once-per-turn",
      "effect": {
        "instructions": [
          {
            "do": "token",
            "count": 1,
            "spec": {
              "name": "Ally Token",
              "types": [
                "creature"
              ],
              "subtypes": [
                "Ally"
              ],
              "colors": [
                "W"
              ],
              "power": 1,
              "toughness": 1
            }
          }
        ]
      },
      "triggerIf": {
        "turn": "self"
      }
    }
  ],
  "procedures": [],
  "assessed": true,
  "printedCast": true,
  "deferred": []
}
```

This example supplies the standing terms, not a guarantee that every departure
interaction has been exercised. `test/triggers.test.ts` checks own and opposing
turns, simultaneous departure, the trigger limit and continuation from a clone
with the trigger waiting.
