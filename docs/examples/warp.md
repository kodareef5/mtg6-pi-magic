# Alternative costs: warp

Warp is a second way to cast the card from your hand (702.185). It is a separate
procedure with the warp cost and its own aftermath. The ordinary cast needs no
procedure at all when the card does nothing on resolution but enter: the table
offers it for the printed cost.

Instructions on a permanent spell run after it enters, with `this` the
permanent. Warp's delayed trigger is created there. Refs inside a `delay`, such
as `this`, are fixed when the delay is created, so it exiles that permanent
and nothing else. If the permanent has already left, the exile does nothing
(603.7c).

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Knight Luminary" },
  "claim": "Cast Knight Luminary for its warp cost",
  "basis": "Warp {1}{W} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)",
  "timing": "spell",
  "cost": { "mana": "{1}{W}" },
  "instructions": [
    { "do": "delay", "event": { "on": "step", "step": "end", "whose": "any" },
      "effect": { "instructions": [
        { "do": "move", "what": "this", "to": "exile", "reason": "exile", "as": "warped" },
        { "do": "permit", "what": "bound:warped", "who": "you", "from": "next-turn", "until": "indefinite" }
      ] } }
  ]
}
```

Its enters trigger is registered as usual and fires whichever way it was cast:

```json package
{
  "card": "Knight Luminary",
  "registers": [
    { "basis": "When this creature enters, create a 1/1 white Human Soldier creature token.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": 1, "spec": { "name": "Human Soldier", "types": ["creature"], "subtypes": ["Human", "Soldier"], "colors": ["W"], "power": 1, "toughness": 1 } }] } }
  ]
}
```

The permission lets you cast it from exile for its printed cost on a later turn.
An `indefinite` permission on a card lasts while that card stays where it is;
once cast, it is a new object and the permission is gone.

A warped creature with an enters trigger is the usual reason to warp: Nova
Hellkite warped in pings a creature, attacks with haste, and leaves at the end
step, ready to be cast again for value later.
