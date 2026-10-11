# Additional triggered instances

A `trigger-rule` registration adds a fixed number of instances when an ability
of a matching permanent triggers (603.2d). Several registrations add their
numbers once. Each resulting instance has its own targets and mode choice.

```json package
{
  "card": "Wizard's Staff",
  "printedCast": true,
  "registers": [
    {
      "basis": "Equipped creature has prowess. (Whenever its controller casts a noncreature spell, that creature gets +1/+1 until end of turn.)",
      "kind": "continuous",
      "affects": {
        "is": "attached",
        "types": [
          "creature"
        ]
      },
      "change": {
        "registers": [
          {
            "basis": "Equipped creature has prowess. (Whenever its controller casts a noncreature spell, that creature gets +1/+1 until end of turn.)",
            "kind": "watch",
            "event": {
              "on": "cast",
              "by": "you",
              "of": {
                "zones": [
                  "stack"
                ],
                "not": {
                  "types": [
                    "creature"
                  ]
                }
              }
            },
            "effect": {
              "instructions": [
                {
                  "do": "modify",
                  "what": "this",
                  "until": "end-of-turn",
                  "change": {
                    "power": 1,
                    "toughness": 1
                  }
                }
              ]
            }
          }
        ]
      }
    },
    {
      "basis": "If a triggered ability of equipped creature triggers, that ability triggers an additional time.",
      "kind": "trigger-rule",
      "affects": {
        "is": "attached",
        "types": [
          "creature"
        ]
      },
      "additional": 1
    }
  ],
  "deferred": [
    {
      "claim": "Equip Wizard for {1}",
      "basis": "Equip Wizard {1}",
      "source": {
        "card": "Wizard's Staff",
        "zones": [
          "battlefield"
        ],
        "controller": "self"
      },
      "timing": "stack"
    },
    {
      "claim": "Equip for {3}",
      "basis": "Equip {3}",
      "source": {
        "card": "Wizard's Staff",
        "zones": [
          "battlefield"
        ],
        "controller": "self"
      },
      "timing": "stack"
    }
  ]
}
```

The granted prowess belongs to the equipped creature. Its controller is the
caster it watches, and each instance modifies that creature. Staff's own
controller does not replace the creature's controller.

A restriction that an ability triggers only once each turn still permits one
instance. An optional effect usable only once each turn can trigger several
times before one resolves; later instances recheck whether it has been used.
Delayed and reflexive triggers created by that ability are separate abilities
and receive no additional instances. Leaving events read the registrations
before the group, including Equipment that leaves with the creature.

This form does not copy an ability on the stack or filter by the event that
caused a trigger. Such a restriction must not be dropped from an assessment.
