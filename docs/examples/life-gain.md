# Life-gain events

`life-gained` watches each positive life gain. `by` names the recipient;
`event:player` and `event:amount` carry that player and the amount. Zero gains,
life payments and life loss do not trigger it. This event does not implement
life-gain replacements or expose a selector for the source of the gain.

One lifelink source dealing damage to several recipients in the same group
causes one gain event for their combined amount. Different sources cause
separate events (119.9, 702.15e). Damage prevention applies before this count.
The life changes happen with damage; triggered abilities wait for priority.

## Starscape Cleric

```json package
{
  "card": "Starscape Cleric",
  "printedCast": true,
  "registers": [
    {
      "kind": "watch",
      "basis": "Offspring {2}{B} (You may pay an additional {2}{B} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)",
      "event": {
        "on": "enters",
        "of": {
          "is": "this"
        }
      },
      "if": {
        "cast": "this",
        "paid": "offspring"
      },
      "effect": {
        "instructions": [
          {
            "do": "token",
            "count": 1,
            "copy": "this",
            "except": {
              "power": 1,
              "toughness": 1
            }
          }
        ]
      }
    },
    {
      "kind": "continuous",
      "basis": "Flying",
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
      "kind": "prohibit",
      "basis": "This creature can't block.",
      "block": {
        "attacker": {
          "types": [
            "creature"
          ]
        },
        "blocker": {
          "is": "this"
        }
      }
    },
    {
      "kind": "watch",
      "basis": "Whenever you gain life, each opponent loses 1 life.",
      "event": {
        "on": "life-gained",
        "by": "you"
      },
      "effect": {
        "instructions": [
          {
            "do": "life",
            "who": "opponent",
            "amount": -1
          }
        ]
      }
    }
  ]
}
```

```json procedure
{
  "source": { "card": "Starscape Cleric", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast Starscape Cleric with offspring",
  "basis": "Offspring {2}{B} (You may pay an additional {2}{B} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)",
  "timing": "spell", "cost": { "additional": [{ "name": "offspring", "mana": "{2}{B}" }] }, "instructions": []
}
```

## Amalia Benavides Aguirre

Explore uses the shared keyword operation. A land goes to hand; otherwise the
permanent receives a counter and its controller may put the card in their
graveyard. Amalia's power check follows completion. An empty library still
explores, and a departed Amalia uses its last known controller (701.44b-c).
These terms do not order simultaneous exploration of several permanents.

```json package
{
  "card": "Amalia Benavides Aguirre", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "Ward—Pay 3 life.",
      "event": { "on": "targeted", "of": { "is": "this" }, "by": "opponent" },
      "effect": { "instructions": [{ "do": "counter", "what": "event:source", "unless": { "who": "event:player", "pays": { "life": 3 } } }] } },
    { "kind": "watch", "basis": "Whenever you gain life, Amalia Benavides Aguirre explores. Then destroy all other creatures if its power is exactly 20. (To have this creature explore, reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)",
      "event": { "on": "life-gained", "by": "you" },
      "effect": { "instructions": [
        { "do": "keyword", "name": "explore", "what": "this" },
        { "do": "destroy", "every": { "types": ["creature"], "other": true }, "if": { "amount": { "power": "this" }, "atLeast": 20, "atMost": 20 } }
      ] } }
  ]
}
```

Both packages retain choices during resolution. Their acceptance records an
interpretation; it does not certify the card's full rules behavior.
