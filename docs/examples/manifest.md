# Manifest dread

`keyword` with `name: "manifest-dread"` and `who` carries the ordered operation
in 701.62. It privately inspects the top two cards, asks that player to choose
one, manifests that card, then puts the other into its owner's graveyard.
It takes no `count`. An empty library still completes the keyword, without a
draw or a loss. Optional `as` binds the manifested permanent's new incarnation.

The shared operation uses `move` with `faceDown: "manifest"` onto the battlefield.
That card has the public copiable values of a nameless, colorless 2/2 creature,
with no mana cost, subtypes or abilities (701.40, 708.2). Its controller may
inspect its identity. The printed entry abilities do not apply. Other permanents'
entry effects still read its face-down creature characteristics.

With priority, its controller may pay the underlying creature card's mana cost
to turn it face up, using a special action and the existing payment stages.
The action works on either turn with spells on the stack. It does not cast,
activate or enter again, and keeps counters, attachments, damage and incarnation.
A noncreature card has no such action. X in that off-stack cost is zero.
Hybrid and Phyrexian payments, morph, disguise and other face-up effects still
need their own terms. A copy of a face-down creature is a face-up nameless 2/2
with no permission to turn face up. Departure and game end publicly reveal
face-down permanents; earlier receipts remain private.

Hovership's linked exile stays exiled. Its departure tells the exiled card's
owner to manifest dread. `each.objects` visits the matching public objects and
binds each as `bound:object`; no exiled card means no operation. Multiple linked
cards each supply their own owner (607.3). This form cannot iterate hidden zones.

```json package
{
  "card": "Unidentified Hovership",
  "registers": [
    {
      "kind": "continuous",
      "basis": "Flying",
      "affects": {
        "is": "this"
      },
      "change": {
        "words": [
          "flying"
        ]
      }
    },
    {
      "kind": "watch",
      "basis": "When this Vehicle enters, exile up to one target creature with toughness 5 or less.",
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
                "creature"
              ],
              "toughness": {
                "atMost": 5
              }
            },
            "upTo": true
          }
        ],
        "instructions": [
          {
            "do": "move",
            "what": "target:0",
            "to": "exile",
            "reason": "exile",
            "link": true
          }
        ]
      }
    },
    {
      "kind": "watch",
      "basis": "When this Vehicle leaves the battlefield, the exiled card's owner manifests dread.",
      "event": {
        "on": "leaves",
        "of": {
          "is": "this"
        }
      },
      "effect": {
        "instructions": [
          {
            "do": "each",
            "objects": {
              "zones": [
                "exile"
              ],
              "linked": true
            },
            "instructions": [
              {
                "do": "keyword",
                "name": "manifest-dread",
                "who": "owner:bound:object"
              }
            ]
          }
        ]
      }
    },
    {
      "kind": "activated",
      "basis": "Crew 1",
      "cost": {
        "tap": {
          "choose": {
            "types": [
              "creature"
            ],
            "controller": "you"
          },
          "totalPower": 1
        }
      },
      "effect": {
        "instructions": [
          {
            "do": "modify",
            "what": "this",
            "change": {
              "types": {
                "add": [
                  "creature"
                ]
              }
            },
            "until": "end-of-turn"
          }
        ]
      }
    }
  ]
}
```
