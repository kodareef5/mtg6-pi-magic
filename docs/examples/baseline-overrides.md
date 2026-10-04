# Baseline rules and the cards that change them

The table enforces a few rules that need no card text, because they hold in
nearly every game:

- one land per turn, from your hand, in your main phase with an empty stack;
- spells other than instants in your main phase with an empty stack;
- a creature that has not been yours since your turn began can't attack or use
  its tap abilities;
- a tapped creature can't attack.

Each card that changes one of these is below. A new one found in play goes into
this file beside the others.

## More lands, and lands from the graveyard

`permit` on the permanent raises the count and adds the zone. The table then
offers the extra land plays.

```json package
{
  "card": "Icetill Explorer",
  "registers": [
    { "basis": "You may play an additional land on each of your turns.", "kind": "permit", "lands": 1 },
    { "basis": "You may play lands from your graveyard.", "kind": "permit", "landsFrom": ["graveyard"] },
    { "basis": "Landfall — Whenever a land you control enters, mill a card.", "kind": "watch",
      "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
      "effect": { "instructions": [{ "do": "mill", "who": "you", "count": 1 }] } }
  ]
}
```

## Haste

Haste is a word on the creature. The table reads it and lets the creature attack
and tap the turn it arrives. Emberheart Challenger, in `until-end-of-turn.md`,
registers it.

## Flash

Flash is about casting the card, before it is a permanent with registrations. The
cast procedure claims it with `speed: "instant"`, and the table then offers the
cast whenever you have priority. Another seat can object if the card has no
flash.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Ambush Gigapede" },
  "claim": "Flash in Ambush Gigapede",
  "basis": "Flash",
  "timing": "spell",
  "speed": "instant",
  "instructions": []
}
```

A permanent that gives other cards flash registers `permit` with a `flash`
selector.
