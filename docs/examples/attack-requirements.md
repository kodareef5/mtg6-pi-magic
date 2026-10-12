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

The native words `can't attack` and `can't block` mark conflicting declarations.
A continuous registration can grant either word under an `if` condition. For
"can't attack unless you control another artifact", grant `can't attack` to
`this` while the count of artifacts controlled by `you`, with `other: true`,
is zero. The condition is read through the layer walk each time; it is not a
stored flag or a requirement to remember an earlier trigger. The seat still
chooses its declaration. Arbitrary restriction sentences are not native words.

This represents the permanent's own static ability. Restrictions imposed by
another source are not abilities granted to the affected permanent (113.12).
For example, losing a creature's abilities does not remove Pacifism's attack
restriction. A temporary "can't be blocked" rule also survives ability removal;
granting a removable word or `prohibit` registration to the recipient changes
that meaning. The current syntax has no standalone temporary blocking rule or
cross-object attack prohibition. A permanent source can impose a blocking-only
restriction with its own `prohibit.block` registration.

## Carnage, Crimson Chaos

Carnage may be cast for its printed cost from hand or for its mayhem price
from the graveyard after its owner discarded that incarnation this turn
(702.187). The permission preserves normal timing and additional costs.
Leaving the graveyard or beginning another turn ends that eligibility (400.7).
It does not exile the spell when it leaves the stack.

`permit.cast.if` reads the current position before announcement.
`discardedThisTurn` reads committed discard history for an exact public
incarnation. It does not look through hidden replacement destinations or
provide a discard trigger; use an explicit `discarded` watch for that event.
The return grants both abilities to the new battlefield incarnation. Carnage
leaving does not end them; the returned creature leaving does. The requirement
grants no haste. After that creature deals combat damage to any player, the
sacrifice trigger waits before priority, including between first-strike and
normal damage.

```json package
{
  "card": "Carnage, Crimson Chaos", "printedCast": true,
  "registers": [
    { "kind": "permit", "basis": "Mayhem {B}{R}", "cast": { "from": ["graveyard"], "mana": "{B}{R}", "if": { "discardedThisTurn": "this", "by": "you" } } },
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
