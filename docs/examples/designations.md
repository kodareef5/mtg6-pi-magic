# Permanent designations

`designate` records a physical designation on the current permanent. Harnessing
an already harnessed permanent changes nothing (701.64). Leaving the battlefield
clears the designation. It is neither an ability nor a copiable characteristic.

The infinity symbol represents a static ability that grants the printed ability
while the permanent is harnessed (702.186). The continuous registration below
selects the marked permanent and grants its end-step watch. The watch itself
has no intervening condition: once triggered, it can resolve after its source
leaves. These terms do not establish that a player paid the correct harness cost.

```json package
{
  "card": "The Mind Stone",
  "registers": [
    { "kind": "continuous", "basis": "Indestructible", "affects": { "is": "this" }, "change": { "words": ["indestructible"] } },
    { "kind": "mana", "basis": "{T}: Add {W}.", "cost": { "tap": true }, "colors": ["W"] },
    {
      "kind": "continuous",
      "basis": "∞ — At the beginning of your end step, exile up to one other target nonland permanent you control, then return that card to the battlefield under its owner's control.",
      "affects": { "is": "this", "designations": ["harnessed"] },
      "change": { "registers": [{
        "kind": "watch",
        "basis": "∞ — At the beginning of your end step, exile up to one other target nonland permanent you control, then return that card to the battlefield under its owner's control.",
        "event": { "on": "step", "step": "end", "whose": "you" },
        "effect": {
          "targets": [{ "object": { "controller": "you", "other": true, "not": { "types": ["land"] } }, "count": 1, "upTo": true }],
          "instructions": [
            { "do": "move", "what": "target:0", "to": "exile", "reason": "exile", "as": "exiled" },
            { "do": "move", "what": "bound:exiled", "to": "battlefield", "controller": "owner:bound:exiled", "reason": "resolve" }
          ]
        }
      }] }
    }
  ]
}
```

```json procedure
{
  "source": { "card": "The Mind Stone", "zones": ["battlefield"], "controller": "self" },
  "claim": "Harness The Mind Stone",
  "basis": "{5}{W}, {T}: Harness The Mind Stone. (Once harnessed, its ∞ ability is active.)",
  "timing": "stack",
  "cost": { "mana": "{5}{W}", "tap": true },
  "instructions": [{ "do": "designate", "what": "this", "designation": "harnessed" }]
}
```

## Solved Cases

A solved Case keeps its designation through type changes and ability loss,
and loses it when it leaves the battlefield (719.3b). Its solve watch checks
the printed condition and that it is unsolved both when it triggers and when
it resolves (719.3a). The designation is not copied. It does not preserve an
ability removed by another effect.

The deferred activation must use a procedure condition matching `this` against
`designations:["solved"]`. This registration supplies the life gain and solve
terms, not the deferred graveyard permission.

```json package
{
  "card": "Case of the Uneaten Feast",
  "registers": [
    {
      "basis": "Whenever a creature you control enters, you gain 1 life.",
      "kind": "watch",
      "event": {
        "on": "enters",
        "of": {
          "types": [
            "creature"
          ],
          "controller": "you"
        }
      },
      "effect": {
        "instructions": [
          {
            "do": "life",
            "who": "you",
            "amount": 1
          }
        ]
      }
    },
    {
      "basis": "To solve \u2014 You've gained 5 or more life this turn. (If unsolved, solve at the beginning of your end step.)",
      "kind": "watch",
      "event": {
        "on": "step",
        "step": "end",
        "whose": "you"
      },
      "if": {
        "all": [
          {
            "not": {
              "is": "this",
              "matches": {
                "designations": [
                  "solved"
                ]
              }
            }
          },
          {
            "amount": {
              "history": "life-gained",
              "by": "you"
            },
            "atLeast": 5
          }
        ]
      },
      "effect": {
        "instructions": [
          {
            "do": "designate",
            "what": "this",
            "designation": "solved"
          }
        ]
      }
    }
  ],
  "procedures": [],
  "assessed": true,
  "printedCast": true,
  "deferred": [
    {
      "claim": "Activate the solved Case's sacrifice ability, only while this Case is solved; grant the creature cards currently in your graveyard permission to be cast from there until end of turn.",
      "basis": "Solved \u2014 Sacrifice this Case: Creature cards in your graveyard gain \"You may cast this card from your graveyard\" until end of turn.",
      "source": {
        "card": "Case of the Uneaten Feast",
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
