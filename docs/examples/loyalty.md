# Token abilities and loyalty

Countersculpt's paid additional-cost variant uses the printed UU plus 1. Its
Empower Jace sequence follows 701.71a: create the token only if none exists,
choose a controlled Jace planeswalker token, then add one loyalty counter.
State-based actions wait until the spell finishes, so the new zero-loyalty
token survives long enough to receive that counter.

```json procedure
{
  "claim": "Cast Countersculpt, paying the additional mana, then empower Jace",
  "basis": "As an additional cost to cast this spell, behold a Jace or pay {1}. ... Counter target spell. Empower Jace 1.",
  "source": { "card": "Countersculpt", "zones": ["hand"], "controller": "self" },
  "timing": "spell", "cost": { "mana": "{1}{U}{U}" },
  "targets": [{ "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "planeswalker", "sorcery"] } }],
  "instructions": [
    { "do": "counter", "what": "target:0" },
    {
      "do": "token", "count": 1,
      "if": { "amount": { "count": { "controller": "you", "types": ["planeswalker"], "subtypes": ["Jace"], "token": true } }, "atMost": 0 },
      "spec": { "name": "Jace", "types": ["planeswalker"], "subtypes": ["Jace"], "colors": ["U"], "loyalty": 0,
        "registers": [
          {
            "kind": "activated", "basis": "[−1]: Surveil 1", "cost": { "loyalty": -1 },
            "effect": { "instructions": [
              { "do": "keyword", "name": "surveil", "who": "you", "count": 1 }
            ] }
          },
          {
            "kind": "activated", "basis": "[−3]: Draw a card", "cost": { "loyalty": -3 },
            "effect": { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] }
          }
        ]
      }
    },
    { "do": "choose", "who": "you", "from": { "controller": "you", "types": ["planeswalker"], "subtypes": ["Jace"], "token": true }, "count": 1, "as": "jace" },
    { "do": "counters", "on": "bound:jace", "kind": "loyalty", "amount": 1 }
  ]
}
```

The token's abilities quote the rule-defined token text from 701.71a; the
creator's procedure still quotes its own printed Empower instruction. Surveil
uses the shared keyword operation and records completion after the choices.

`activated` registrations become ordinary listed procedures. Removing the
ability removes those uses, including a previously reused source requirement.
They may also be granted to a permanent through `change.registers`.

`cost.loyalty` is signed: positive adds counters, negative removes them, and
zero still uses the loyalty activation for that incarnation this turn. It
requires the controller's main phase and an empty stack unless an accepted
timing permission overrides that window. Another ability or
controller does not reset that allowance; a new incarnation does. Payment is
checked again before commitment. Combine adjustments into that one signed cost.
Printed `L3` and token `loyalty: 3` supply starting counters on entry; they are
not extra model-written entry effects. A zero-loyalty planeswalker goes to the
graveyard at the next state-based check even if indestructible.

This example covers the paid-mana variant. The other variant uses the same
instructions with UU and a `show` cost for a Jace; the card's interpreter must
prepare both. It does not establish that attacks against planeswalkers work.

## Temporary loyalty timing

Jace's Machinations grants a rules permission before Empower creates or grows
a token. The selector is read when activating, so it includes a Jace that
enters later that turn. It does not grant another activation to a permanent
already used that turn, remove a separate sorcery-only restriction, or permit
activation without priority. The grant expires during cleanup.

```json procedure
{
  "claim": "Cast Jace's Machinations",
  "basis": "Until end of turn, you may activate loyalty abilities of Jace planeswalkers you control on any player's turn any time you could cast an instant.\nEmpower Jace 8. (Put eight loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")",
  "source": {"card": "Jace's Machinations", "zones": ["hand"], "controller": "self"},
  "timing": "spell",
  "cost": {"mana": "{2}{U}"},
  "instructions": [
    {
      "do": "activation-timing",
      "who": "you",
      "ability": "loyalty",
      "of": {"controller": "you", "types": ["planeswalker"], "subtypes": ["Jace"]},
      "until": "end-of-turn"
    },
    {
      "do": "token",
      "count": 1,
      "if": {"amount": {"count": {"controller": "you", "types": ["planeswalker"], "subtypes": ["Jace"], "token": true}}, "atMost": 0},
      "spec": {
        "name": "Jace",
        "types": ["planeswalker"],
        "subtypes": ["Jace"],
        "colors": ["U"],
        "loyalty": 0,
        "registers": [
          {
            "kind": "activated",
            "basis": "[−1]: Surveil 1",
            "cost": {"loyalty": -1},
            "effect": {
              "instructions": [
                { "do": "keyword", "name": "surveil", "who": "you", "count": 1 }
              ]
            }
          },
          {
            "kind": "activated",
            "basis": "[−3]: Draw a card",
            "cost": {"loyalty": -3},
            "effect": {"instructions": [{"do": "draw", "who": "you", "count": 1}]}
          }
        ]
      }
    },
    {
      "do": "choose",
      "who": "you",
      "from": {"controller": "you", "types": ["planeswalker"], "subtypes": ["Jace"], "token": true},
      "count": 1,
      "as": "jace"
    },
    {"do": "counters", "on": "bound:jace", "kind": "loyalty", "amount": 8}
  ]
}
```
