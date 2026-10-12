# Discard events

`discarded` watches cards discarded from their owner's hand, including costs,
resolving instructions and cleanup. `by` names that owner. Replacement exile
still counts; milling, sacrificing and ordinary hand departures do not.
`batch: true` combines the matching discards in one group, and `event:amount`
retains their number. Without it, each card raises a separate trigger.

These watches read the abilities and characteristics after the event (603.10).
A watcher leaving in that group no longer watches; one entering does.
An `of` selector names the card in its destination zone. A public discard
retains that new incarnation for `event:object`. An unrevealed hidden discard
retains only its player and amount, without characteristics or an object ref
(701.9c). Revealed replacement discards into hidden zones are not supported.
Counting an event does not certify that the discard was legal.

## Marauding Mako

Cycling pays the discard before the draw ability resolves. A Mako already on
the battlefield triggers above that ability. The discarded Mako does not
watch its own discard from the graveyard.

```json package
{
  "card": "Marauding Mako", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "Whenever you discard one or more cards, put that many +1/+1 counters on this creature.",
      "event": { "on": "discarded", "by": "you", "batch": true },
      "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": { "event": "amount" } }] } }
  ]
}
```

```json procedure
{
  "source": { "card": "Marauding Mako", "zones": ["hand"], "controller": "self" },
  "claim": "Cycle Marauding Mako",
  "basis": "Cycling {2} ({2}, Discard this card: Draw a card.)",
  "timing": "stack", "cost": { "mana": "{2}", "discard": "this" },
  "instructions": [{ "do": "draw", "who": "you", "count": 1 }]
}
```
