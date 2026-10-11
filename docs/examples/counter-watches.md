# Counter placement and thresholds

`on: "counters"` watches positive counters put on battlefield permanents,
including counters given as they enter (122.6). `counter` selects the kind;
`of` selects the recipient. `reaches: N` fires once when the count crosses from
below N to at least N (122.7). It is an event test, not an intervening condition:
removing counters before resolution does not undo the trigger.

Without `reaches`, each counter causes a trigger. `batch: true` instead makes
one trigger for the whole simultaneous group, with the total in `event.amount`.
It does not express separate batches for each recipient. The event records no
actor who put the counters, so use `of.controller` for the recipient's controller
and refuse an actor-specific `by` claim. Removal and zero counters do not fire.
This shape supplies neither counter replacement ordering nor player counters.

## Political Triumph

The first ability scries privately before putting its plan counter. The fourth
counter makes a separate waiting trigger. That ability sacrifices the enchantment,
then draws, then puts counters on the creatures the controller has at resolution.
A jump from two plan counters to five crosses four just once.

```json package
{
  "card": "Political Triumph", "printedCast": true,
  "registers": [
    { "kind": "watch",
      "basis": "Whenever a creature you control enters, scry 1 and put a plan counter on this enchantment.",
      "event": { "on": "enters", "of": { "types": ["creature"], "controller": "you" } },
      "effect": { "instructions": [
        { "do": "look", "who": "you", "what": { "top": 1, "of": "you" }, "as": "scry" },
        { "do": "order", "who": "you", "what": "bound:scry", "position": "bottom", "may": true },
        { "do": "counters", "on": "this", "kind": "plan", "amount": 1 }
      ] } },
    { "kind": "watch",
      "basis": "When the fourth plan counter is put on this enchantment, sacrifice it, draw a card, and put a +1/+1 counter on each creature you control.",
      "event": { "on": "counters", "counter": "plan", "reaches": 4, "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "move", "what": "this", "to": "graveyard", "reason": "sacrifice" },
        { "do": "draw", "who": "you", "count": 1 },
        { "do": "counters", "every": { "types": ["creature"], "controller": "you" }, "kind": "+1/+1", "amount": 1 }
      ] } }
  ]
}
```

Source coverage and syntax acceptance do not certify an interpretation.
