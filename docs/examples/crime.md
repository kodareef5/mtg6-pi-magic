# Crimes and watches outside the battlefield

A watch's `zones` states where its source ability functions. Omitted zones mean
battlefield. Explicit watches can use graveyard, stack, exile or command, where
identities are public. Hidden-zone watches remain unsupported. A face-down
battlefield permanent still uses abilities that other effects grant it.

`event.on: crime` fires once when a player casts a spell, activates an ability,
or puts a triggered ability on the stack with one or more qualifying targets
(700.13). Qualifying targets are an opponent, something that opponent controls
on the battlefield or stack, or a card in their graveyard. Multiple such targets
still constitute one crime. Targeting only your own objects does not qualify.
The event records the acting player and the spell or ability; no resolution or
successful effect is required.

Forsaken Miner's return ability functions only in its graveyard (113.6m). It
waits above the spell or ability that caused the crime. Its owner then chooses
whether to pay. The return cannot follow a later graveyard incarnation if the
original card left before the trigger resolved.

```json package
{
  "card": "Forsaken Miner",
  "printedCast": true,
  "registers": [
    { "kind": "prohibit", "basis": "This creature can't block.", "block": { "attacker": { "types": ["creature"] }, "blocker": { "is": "this" } } },
    { "kind": "watch", "zones": ["graveyard"],
      "basis": "Whenever you commit a crime, you may pay {B}. If you do, return this card from your graveyard to the battlefield. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)",
      "event": { "on": "crime", "by": "you" },
      "effect": { "instructions": [
        { "do": "pay", "who": "you", "may": true, "cost": { "mana": "{B}" }, "as": "paid" },
        { "do": "move", "what": "this", "to": "battlefield", "reason": "resolve", "controller": "you", "if": { "bound": "paid" } }
      ] } }
  ]
}
```

Declining or lacking the payment returns nothing. Returning the Miner installs
its battlefield terms, including its blocking restriction. Choosing a legal
payment proves that resources existed, not that the prepared card meaning or
original targeting was correct.
