# Permissions until the next end step

`permit.until: {"nextEndStep": "you"}` expires when that player's next end
step begins, before beginning-of-step triggers and priority. A permission
created during an end step waits for the next such step. Skipping that step
does not end the permission; an additional end step can end it in the same
turn. The named player is fixed when the instruction resolves.

This duration does not grant flash, change a cost, or grant another land play.
It does not last through the named end step or its cleanup.

## Inti, Seneschal of the Sun

The attack trigger offers a discard before its reflexive trigger chooses a
target. The independent discard watch fires once for cards discarded together.
Its exile binds the new card incarnation to the permission.

```json package
{
  "card": "Inti, Seneschal of the Sun", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "Whenever you attack, you may discard a card. When you do, put a +1/+1 counter on target attacking creature. It gains trample until end of turn.",
      "event": { "on": "attacked-with", "by": "you" },
      "effect": { "instructions": [
        { "do": "pay", "who": "you", "cost": { "discard": 1 }, "may": true, "as": "discarded" },
        { "do": "reflect", "if": { "bound": "discarded" }, "effect": {
          "targets": [{ "object": { "types": ["creature"], "attacking": true } }],
          "instructions": [
            { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 },
            { "do": "modify", "what": "target:0", "change": { "words": ["trample"] }, "until": "end-of-turn" }
          ]
        } }
      ] } },
    { "kind": "watch", "basis": "Whenever you discard one or more cards, exile the top card of your library. You may play that card until your next end step.",
      "event": { "on": "discarded", "by": "you", "batch": true },
      "effect": { "instructions": [
        { "do": "move", "what": { "top": 1, "of": "you" }, "to": "exile", "reason": "exile", "as": "exiled" },
        { "do": "permit", "what": "bound:exiled", "who": "you", "until": { "nextEndStep": "you" } }
      ] } }
  ]
}
```
