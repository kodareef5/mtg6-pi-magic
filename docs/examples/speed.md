# Player speed

Start your engines! starts a player's speed at one as a state-based action
(704.5aa). Multiple engines do not start it twice. Speed remains after those
permanents leave or lose their abilities. A speed amount reads zero before
the player has speed; the physical value is still absent until it starts.

The inherent ability in 702.179d triggers once each turn when an opponent
actually loses life during that player's turn. It has no source. Losing life
to a payment counts; simultaneous life gain does not erase a loss. Prevented
damage does not count. The ability uses the normal stack, can be countered,
and checks speed below four again as it resolves. No permanent owns this
trigger or supplies an extra trigger instance.

Max speed grants the specified ability while speed equals four (702.178).
The conditional registration reads the permanent's current controller, so a
control change reads the new controller's speed. This does not grant permission
to skip its cost, targets or sorcery timing.

```json package
{
  "card": "Perilous Snare",
  "registers": [
    {
      "kind": "continuous",
      "basis": "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)",
      "affects": {
        "is": "this"
      },
      "change": {
        "words": [
          "start your engines!"
        ]
      }
    },
    {
      "kind": "watch",
      "basis": "When this artifact enters, exile target nonland permanent an opponent controls until this artifact leaves the battlefield.",
      "event": {
        "on": "enters",
        "of": {
          "is": "this"
        }
      },
      "effect": {
        "targets": [
          {
            "object": {
              "controller": "opponent",
              "not": {
                "types": [
                  "land"
                ]
              }
            }
          }
        ],
        "instructions": [
          {
            "do": "move",
            "what": "target:0",
            "to": "exile",
            "reason": "exile",
            "until": {
              "leaves": "this"
            }
          }
        ]
      }
    },
    {
      "kind": "continuous",
      "basis": "Max speed \u2014 {T}: Put a +1/+1 counter on target creature or Vehicle you control. Activate only as a sorcery.",
      "if": {
        "amount": {
          "speed": "you"
        },
        "atLeast": 4,
        "atMost": 4
      },
      "affects": {
        "is": "this"
      },
      "change": {
        "registers": [
          {
            "kind": "activated",
            "basis": "Max speed \u2014 {T}: Put a +1/+1 counter on target creature or Vehicle you control. Activate only as a sorcery.",
            "cost": {
              "tap": true
            },
            "speed": "sorcery",
            "effect": {
              "targets": [
                {
                  "object": {
                    "controller": "you",
                    "any": [
                      {
                        "types": [
                          "creature"
                        ]
                      },
                      {
                        "subtypes": [
                          "Vehicle"
                        ]
                      }
                    ]
                  }
                }
              ],
              "instructions": [
                {
                  "do": "counters",
                  "on": "target:0",
                  "kind": "+1/+1",
                  "amount": 1
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
