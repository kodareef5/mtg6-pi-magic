# Sacrifice events and turn counts

`sacrificed` watches a permanent sacrificed by the player named by `by`.
`of` reads its battlefield characteristics and token status before departure.
The watch looks back to the same moment (603.10a), so a source sacrificed in
that group still sees the other sacrifices. Replacement exile remains a
sacrifice. Destruction, bouncing and other departures do not qualify.

`history: "sacrificed"` counts permanents sacrificed this turn by the named
player, including tokens and sacrifices made before the reader entered.
It retains the controller at the time and no hidden object identities.
The count does not claim that a recorded sacrifice was legal.

## Biotech Specialist

The Lander has its complete printed ability. Sacrificing it pays the activation
before the search resolves, and the damage trigger waits above that ability.

```json package
{
  "card": "Biotech Specialist", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "When this creature enters, create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": 1, "spec": {
        "name": "Lander Token", "types": ["artifact"], "subtypes": ["Lander"], "colors": [],
        "registers": [{ "kind": "activated", "basis": "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
          "cost": { "mana": "{2}", "tap": true, "sacrifice": "this" },
          "effect": { "instructions": [
            { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "types": ["land"], "supertypes": ["basic"] }, "count": 1, "upTo": true, "as": "land" },
            { "do": "move", "what": "bound:land", "to": "battlefield", "tapped": true, "reason": "resolve" },
            { "do": "shuffle", "who": "you" }
          ] } }]
      } }] } },
    { "kind": "watch", "basis": "Whenever you sacrifice an artifact, this creature deals 2 damage to target opponent.",
      "event": { "on": "sacrificed", "by": "you", "of": { "zones": ["battlefield"], "types": ["artifact"] } },
      "effect": { "targets": [{ "player": "opponent" }], "instructions": [{ "do": "damage", "to": "target:0", "amount": 2 }] } }
  ]
}
```

## The Sackville-Bagginses

The optional payment binds success, separately from the tokens created afterward.
A Treasure sacrificed for mana can trigger both this watch and Biotech's.

```json package
{
  "card": "The Sackville-Bagginses", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "When The Sackville-Bagginses enter, you may sacrifice another creature or artifact. If you do, draw a card and create a Treasure token.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "pay", "who": "you", "cost": { "sacrifice": { "choose": { "zones": ["battlefield"], "types": ["creature", "artifact"], "controller": "you", "other": true }, "count": 1 } }, "may": true, "as": "sacrificed" },
        { "do": "draw", "who": "you", "count": 1, "if": { "bound": "sacrificed" } },
        { "do": "token", "count": 1, "if": { "bound": "sacrificed" }, "spec": {
          "name": "Treasure Token", "types": ["artifact"], "subtypes": ["Treasure"], "colors": [],
          "registers": [{ "kind": "mana", "basis": "{T}, Sacrifice this token: Add one mana of any color.", "cost": { "tap": true, "sacrifice": "this" }, "any": 1 }]
        } }
      ] } },
    { "kind": "watch", "basis": "Whenever you sacrifice a token, target opponent loses 1 life.",
      "event": { "on": "sacrificed", "by": "you", "of": { "zones": ["battlefield"], "token": true } },
      "effect": { "targets": [{ "player": "opponent" }], "instructions": [{ "do": "life", "who": "target:0", "amount": -1 }] } }
  ]
}
```

## Obsessive Pursuit

The attack trigger fires once for the attack declaration, rather than once per
attacker. Its count is read on resolution. Lifegain from its granted lifelink
still belongs to the creature that deals the damage.

```json package
{
  "card": "Obsessive Pursuit", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "When this enchantment enters and at the beginning of your upkeep, you lose 1 life and create a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "life", "who": "you", "amount": -1 },
        { "do": "token", "count": 1, "spec": { "name": "Clue Token", "types": ["artifact"], "subtypes": ["Clue"], "colors": [],
          "registers": [{ "kind": "activated", "basis": "{2}, Sacrifice this token: Draw a card.", "cost": { "mana": "{2}", "sacrifice": "this" },
            "effect": { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] } }]
        } }
      ] } },
    { "kind": "watch", "basis": "When this enchantment enters and at the beginning of your upkeep, you lose 1 life and create a Clue token. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")",
      "event": { "on": "step", "step": "upkeep", "whose": "you" },
      "effect": { "instructions": [
        { "do": "life", "who": "you", "amount": -1 },
        { "do": "token", "count": 1, "spec": { "name": "Clue Token", "types": ["artifact"], "subtypes": ["Clue"], "colors": [],
          "registers": [{ "kind": "activated", "basis": "{2}, Sacrifice this token: Draw a card.", "cost": { "mana": "{2}", "sacrifice": "this" },
            "effect": { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] } }]
        } }
      ] } },
    { "kind": "watch", "basis": "Whenever you attack, put X +1/+1 counters on target attacking creature, where X is the number of permanents you've sacrificed this turn. If X is three or more, that creature gains lifelink until end of turn.",
      "event": { "on": "attacked-with", "by": "you" },
      "effect": { "targets": [{ "object": { "zones": ["battlefield"], "types": ["creature"], "attacking": true } }], "instructions": [
        { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": { "history": "sacrificed", "by": "you" } },
        { "do": "modify", "what": "target:0", "change": { "words": ["lifelink"] }, "until": "end-of-turn", "if": { "amount": { "history": "sacrificed", "by": "you" }, "atLeast": 3 } }
      ] } }
  ]
}
```
