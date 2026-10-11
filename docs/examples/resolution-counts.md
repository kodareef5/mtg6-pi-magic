# Count an ability's resolutions

`{ "resolution": true }` is the current ability's resolution number this turn.
It starts at one and stays fixed while that program runs. The table records
completion after the last instruction, including a declined optional ability
or a resolution whose instruction conditions are all false (608.2n-p).
Countering an ability, losing all its targets, or failing an intervening-if
check does not complete it (608.2a-b).

The identity is its source incarnation and source quotation. Changing its
controller does not reset the count. A departed source keeps its identity;
returning it to the battlefield gives it a new one (400.7). A token copy is a
separate source. An ability copy would share the original identity (707.10b),
but copying stack abilities remains unsupported. Do not use this shape for
distinct abilities with the same quotation on the same source, or for counts
across turns. Programs that never request this amount retain their existing
journal events.

## Belladonna Took

Each entering token raises an ability, including several tokens entering
together. The controller orders them on the stack. The first one to resolve
gains life, the second draws, and the third puts counters on the creatures
controlled at that point. Later resolutions still count but do nothing.
These are instruction conditions, not intervening-if clauses on the watch.

```json package
{
  "card": "Belladonna Took", "printedCast": true,
  "registers": [
    { "kind": "watch",
      "basis": "Whenever a token you control enters, you gain 1 life if this is the first time this ability has resolved this turn. If it's the second time, draw a card. If it's the third time, put a +1/+1 counter on each creature you control.",
      "event": { "on": "enters", "of": { "token": true, "controller": "you" } },
      "effect": { "instructions": [
        { "do": "life", "who": "you", "amount": 1, "if": { "amount": { "resolution": true }, "atLeast": 1, "atMost": 1 } },
        { "do": "draw", "who": "you", "count": 1, "if": { "amount": { "resolution": true }, "atLeast": 2, "atMost": 2 } },
        { "do": "counters", "every": { "types": ["creature"], "controller": "you" }, "kind": "+1/+1", "amount": 1, "if": { "amount": { "resolution": true }, "atLeast": 3, "atMost": 3 } }
      ] } }
  ]
}
```

Source coverage and syntax acceptance do not certify an interpretation.
