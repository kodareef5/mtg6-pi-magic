# Named additional mana costs

Kicker and offspring add to a spell's mana price (601.2b, 601.2f, 702.33a,
702.175a). A procedure selects the paid variant; its named additional cost
survives an alternative casting permission. Reductions apply to the total.
The source quote and syntax check do not certify the interpretation.

Burst Lightning's kicked variant pays its printed {R} plus {4}:

```json procedure
{
  "source": {"card": "Burst Lightning", "zones": ["hand", "graveyard", "exile"], "controller": "any"},
  "claim": "Cast kicked Burst Lightning",
  "basis": "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.",
  "timing": "spell",
  "cost": {"additional": [{"name": "kicker", "mana": "{4}"}]},
  "targets": [{"object": {"types": ["creature", "planeswalker", "battle"]}, "player": "any"}],
  "instructions": [{"do": "damage", "to": "target:0", "amount": 4}]
}
```

If a permission instead offers this spell for {2}, its kicked variant costs
{6}, before reductions. Its mana value remains one. The ordinary un-kicked
variant omits `additional` and deals two damage.

`{cast: "this", paid: "offspring"}` reads the named payment from the cast
receipt, including when the permanent is entering. Use separate names for
separate instances (702.175b). No payment is stored on the permanent; leaving
and returning breaks the association. This field supports additional mana
only. Nonmana costs retain their existing cost fields. Offspring's fixed
power/toughness exception uses [token copies](token-copies.md); copying spell
payment choices remains unsupported.
