# Counters and attachments after paying a cost

A selected sacrifice or return cost can bind its paid incarnations with `as`
and the objects attached to those permanents at payment with `attachedAs`.
The attachment binding keeps exact incarnations. A later attachment or a
returned Equipment does not enter that set, and leaving the battlefield removes
an object from the live selection. This captures the payment, not all objects
that were attached at some point during the game.

The counters instruction's `copy` form reads one source's current or last-known
counter counts and puts the same number of each kind on each recipient. It does
not remove counters from a surviving source. It does not support transferring
counters between two surviving permanents; that requires a separate removal.

```json procedure
{
  "claim": "Sacrifice Zack Fair and pass its counters and one attached Equipment",
  "basis": "{1}, Sacrifice Zack Fair: Target creature you control gains indestructible until end of turn. Put Zack Fair's counters on that creature and attach an Equipment that was attached to Zack Fair to that creature.",
  "source": {
    "card": "Zack Fair",
    "zones": [
      "battlefield"
    ],
    "controller": "self"
  },
  "timing": "stack",
  "cost": {
    "mana": "{1}",
    "sacrifice": {
      "choose": {
        "is": "this"
      },
      "count": 1,
      "as": "sacrificed",
      "attachedAs": "old-attachments"
    }
  },
  "targets": [
    {
      "object": {
        "types": [
          "creature"
        ],
        "controller": "you"
      }
    }
  ],
  "instructions": [
    {
      "do": "modify",
      "what": "target:0",
      "until": "end-of-turn",
      "change": {
        "words": [
          "indestructible"
        ]
      }
    },
    {
      "do": "counters",
      "on": "target:0",
      "copy": "bound:sacrificed"
    },
    {
      "do": "choose",
      "who": "you",
      "from": {
        "is": "bound:old-attachments",
        "subtypes": [
          "Equipment"
        ],
        "not": {
          "types": [
            "creature"
          ]
        }
      },
      "count": 1,
      "as": "equipment"
    },
    {
      "do": "attach",
      "what": "bound:equipment",
      "to": "target:0"
    }
  ]
}
```

Zack's original battlefield incarnation supplies the counters even if its card
moves again. Equipment is selected during resolution, after indestructible and
counters. The selector excludes creature Equipment, which cannot be attached
(301.5c). The target still needs to be legal as resolution begins; targeting
Zack itself is legal at announcement, but sacrificing it leaves no legal target.
Reconfigure Equipment needs its own ability terms and is outside this example.
