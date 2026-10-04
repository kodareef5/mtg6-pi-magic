# Revealing for another seat to choose (proposal)

"Target opponent reveals their hand. You choose a card from it" crosses seats:
the opponent shows, and you pick from what you were shown. This is a proposal
under review. The schemas parse it; the table does not run it yet.

`reveal` shows objects to a player. `revealed` in a selector limits a choice to
what the chooser was shown. `choose` with `who: "you"` over the opponent's hand
is then a choice among visible cards, and the receipt says publicly what was
revealed.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Auntie's Sentence" },
  "claim": "Auntie's Sentence: look at their hand and take a permanent card",
  "basis": "Target opponent reveals their hand. You choose a nonland permanent card from it. That player discards that card.",
  "timing": "spell",
  "targets": [{ "player": "opponent" }],
  "instructions": [
    { "do": "reveal", "every": { "zones": ["hand"], "owner": "target:0" }, "to": "you" },
    { "do": "choose", "who": "you", "from": { "zones": ["hand"], "owner": "target:0", "revealed": true,
      "types": ["artifact", "creature", "enchantment", "planeswalker", "battle"] }, "count": 1, "as": "taken" },
    { "do": "move", "what": "bound:taken", "to": "graveyard", "reason": "discard" }
  ]
}
```

Open: whether a revealed hand needs its own window, so the revealing seat can
see that it was shown and the chooser can take its time, or whether the choice
menu is enough.
