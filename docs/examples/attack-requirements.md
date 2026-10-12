# Required attacks

The accepted word `attacks each combat if able` marks a creature's current
attack requirement. Finishing a declaration warns about omitted creatures that
can attack: untapped creatures without summoning sickness or a conflicting
attack restriction. Selecting the creature removes that omission warning.
The seat still chooses the attackers and the final declaration; the table
does not attack for it or remove the warned declaration (508.1d).

This handles the unconditional requirement. Attack costs, goad's preferred
opponent and competing limits on the number of attackers need further terms;
this word does not implement them.

## Carnage, Crimson Chaos

This example covers Carnage's printed-cost cast and returned creature.
Its conditional mayhem permission is still a separate standing blocker.
The return grants both abilities to the new battlefield incarnation. Carnage
leaving does not end them; the returned creature leaving does. The requirement
grants no haste. After that creature deals combat damage to any player, the
sacrifice trigger waits before priority, including between first-strike and
normal damage.

```json package
{
  "card": "Carnage, Crimson Chaos", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Trample", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["trample"] } },
    { "kind": "watch", "basis": "When Carnage enters, return target creature card with mana value 3 or less from your graveyard to the battlefield. It gains \"This creature attacks each combat if able\" and \"When this creature deals combat damage to a player, sacrifice it.\"",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": {
        "targets": [{ "object": { "zones": ["graveyard"], "owner": "you", "types": ["creature"], "manaValue": { "atMost": 3 }, "token": false } }],
        "instructions": [
          { "do": "move", "what": "target:0", "to": "battlefield", "controller": "you", "reason": "resolve",
            "change": { "words": ["attacks each combat if able"], "registers": [
              { "kind": "watch", "basis": "When this creature deals combat damage to a player, sacrifice it.",
                "event": { "on": "combat-damage", "of": { "is": "this" }, "player": true },
                "effect": { "instructions": [{ "do": "move", "what": "this", "to": "graveyard", "reason": "sacrifice" }] } }
            ] } }
        ]
      } }
  ]
}
```
