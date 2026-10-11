# Revealing a hand before choosing

Duress reveals the target opponent's whole hand to every seat, then lets the
spell's controller choose a noncreature, nonland card for that player to discard.
An empty eligible selection moves nothing. The choice itself is mandatory when
an eligible card exists, so it has no `upTo`.

```json procedure
{
  "claim": "Cast Duress to reveal an opponent's hand and choose a discard",
  "basis": "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.",
  "source": { "card": "Duress", "zones": ["hand"], "controller": "self" },
  "timing": "spell",
  "targets": [{ "player": "opponent" }],
  "instructions": [
    { "do": "reveal", "every": { "zones": ["hand"], "owner": "target:0" }, "as": "hand" },
    {
      "do": "choose", "who": "you", "count": 1, "as": "discard",
      "from": { "zones": ["hand"], "is": "bound:hand", "not": { "types": ["creature", "land"] } }
    },
    { "do": "move", "what": "bound:discard", "to": "graveyard", "reason": "discard" }
  ]
}
```

The reveal confirmation shows only a count. Identities become visible when its
recorded changes commit; later receipt text cannot expose those identities in
earlier hidden actions. The resolution retains those visible identities until
it ends; the public receipt remains afterward. Persistent knowledge of hidden
objects is still unfinished. `reveal` does not move a card, refuses face-down
objects, and does not certify permission to reveal those cards.
