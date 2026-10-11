# Exile until a source leaves

`move` to exile may carry `until: { leaves: ObjectRef }`. The reference must
still name that battlefield incarnation when the instruction resolves; if it
already left, nothing is exiled (610.3a-b).

The return is a second one-shot effect. It happens immediately after the source
leaves, with no trigger to counter and no priority in between. Cards return to
their original zones, under their owners' control on the battlefield (610.3c).
All durations ending after the same group return together (610.3d). Entry choices
still occur before those cards enter. The exiled incarnation alone is tracked:
a card that left exile cannot be retrieved later, and a token cannot return.

This syntax does not implement a separate "when this leaves" triggered ability,
face-down exile, or a duration other than that source leaving the battlefield.
A return note also supplies the relationship for a `linked` selector.

```json package
{
  "card": "Seam Rip",
  "registers": [
    {
      "kind": "watch",
      "basis": "When this enchantment enters, exile target nonland permanent an opponent controls with mana value 2 or less until this enchantment leaves the battlefield.",
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
              },
              "manaValue": {
                "atMost": 2
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
    }
  ]
}
```

The Bat looks privately even if it left before its trigger resolved. The
duration check prevents the later exile; it does not undo the permitted look.

```json package
{
  "card": "Deep-Cavern Bat",
  "registers": [
    {
      "kind": "continuous",
      "basis": "Flying, lifelink",
      "affects": {
        "is": "this"
      },
      "change": {
        "words": [
          "flying",
          "lifelink"
        ]
      }
    },
    {
      "kind": "watch",
      "basis": "When this creature enters, look at target opponent's hand. You may exile a nonland card from it until this creature leaves the battlefield.",
      "event": {
        "on": "enters",
        "of": {
          "is": "this"
        }
      },
      "effect": {
        "targets": [
          {
            "player": "opponent"
          }
        ],
        "instructions": [
          {
            "do": "look",
            "who": "you",
            "every": {
              "zones": [
                "hand"
              ],
              "owner": "target:0"
            }
          },
          {
            "do": "choose",
            "who": "you",
            "from": {
              "zones": [
                "hand"
              ],
              "owner": "target:0",
              "not": {
                "types": [
                  "land"
                ]
              }
            },
            "count": 1,
            "upTo": true,
            "as": "chosen"
          },
          {
            "do": "move",
            "what": "bound:chosen",
            "to": "exile",
            "reason": "exile",
            "until": {
              "leaves": "this"
            }
          }
        ]
      }
    }
  ]
}
```
