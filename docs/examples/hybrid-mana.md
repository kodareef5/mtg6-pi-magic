# Hybrid mana choices

The seat chooses a nonhybrid equivalent before targets and cost reductions
(107.4e, 601.2b). Deceit's printed `{4}{U/B}{U/B}` therefore offers `{4}{U}{U}`,
`{4}{U}{B}` and `{4}{B}{B}` when resources permit. The two orders of choosing one
blue and one black are the same equivalent. Each choice still leads to every
physical payment, with complete payments and individual source selection.

Selecting a side does not determine which colors pay generic mana. Deceit's
entry conditions read the actual mana spent through `manaSpent`, including mana
spent on the generic part. Its colors remain blue and black and its mana value
remains six. Its evoke sacrifice also needs the named alternative-cost record;
hybrid payment alone does not implement evoke.

`{2/W}` can become two generic or one white. Reductions apply after that choice,
so reducing generic costs by two removes the generic equivalent but cannot
remove its white alternative. `{C/U}` offers colorless or blue. Phyrexian and
snow payments remain unsupported.

Stated activation costs, resolving payments and manifested creature cards use
the same equivalents. This graveyard activation illustrates the stated form:

```json procedure
{
  "claim": "Return Blessed Ghoul to hand",
  "basis": "{2}{W/B}: Return this card from your graveyard to your hand.",
  "source": { "card": "Blessed Ghoul", "zones": ["graveyard"], "controller": "self" },
  "timing": "stack",
  "cost": { "mana": "{2}{W/B}" },
  "instructions": [{ "do": "move", "what": "this", "to": "hand", "reason": "resolve" }]
}
```

The forecast searches every equivalent for an ordered line. It does not choose
one for the seat or predict intervening effects. Canceling any announcement
stage spends nothing; a saved hybrid choice resumes with that choice intact.
