# Stun counters

Magmatic Hellkite's search puts a basic land onto the battlefield tapped with
one stun counter. The next untap removes that counter and leaves the land
tapped. A later untap can untap it. Rule 122.1d gives one replacement effect to
a permanent with one or more stun counters; one attempted untap removes one
counter, not all its counters.

| Before the attempted untap | After it |
| --- | --- |
| Tapped Mountain, one stun counter | Tapped Mountain, no stun counter |
| Tapped Mountain, two stun counters | Tapped Mountain, one stun counter |
| Untapped Mountain, one stun counter | Untapped Mountain, one stun counter |
| Tapped Mountain, no stun counters | Untapped Mountain, no stun counters |

The same replacement applies when a resolving card instructs a seat to untap
something. The receipt records removal of the counter, so it cannot claim the
permanent untapped. A next-turn resource forecast applies the same known stun
counter and keeps the land out of the available mana sources.

Other optional untaps, untap restrictions and replacement-order interactions
still need their own supported terms. A forecast does not predict those effects
or any opposing action before the untap step.

The Hellkite registration supplies the counter. The shared untap operation
applies its rules meaning; the card needs no separate untap trigger.

```json package
{
  "card": "Magmatic Hellkite",
  "registers": [
    {
      "basis": "Flying",
      "kind": "continuous",
      "affects": {
        "is": "this",
        "zones": [
          "stack",
          "battlefield"
        ]
      },
      "change": {
        "words": [
          "flying"
        ]
      }
    },
    {
      "basis": "When this creature enters, destroy target nonbasic land an opponent controls. Its controller searches their library for a basic land card, puts it onto the battlefield tapped with a stun counter on it, then shuffles. (If a permanent with a stun counter would become untapped, remove one from it instead.)",
      "kind": "watch",
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
              "types": [
                "land"
              ],
              "controller": "opponent",
              "not": {
                "supertypes": [
                  "basic"
                ]
              }
            }
          }
        ],
        "instructions": [
          {
            "do": "destroy",
            "what": "target:0"
          },
          {
            "do": "choose",
            "who": "controller:target:0",
            "from": {
              "zones": [
                "library"
              ],
              "owner": "controller:target:0",
              "types": [
                "land"
              ],
              "supertypes": [
                "basic"
              ]
            },
            "count": 1,
            "upTo": true,
            "as": "basic-land"
          },
          {
            "do": "move",
            "what": "bound:basic-land",
            "to": "battlefield",
            "controller": "controller:target:0",
            "tapped": true,
            "counters": {
              "stun": 1
            },
            "reason": "resolve"
          },
          {
            "do": "shuffle",
            "who": "controller:target:0"
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
