# Choosing sacrifices before locking a casting cost

`cost.sacrifice` with `choose`, `any: true` and a positive `reduce` offers zero
or more distinct controlled permanents. Each selected permanent reduces generic
mana by that amount. It never reduces a colored or colorless symbol. Selections
are recorded before the total cost locks (601.2b, 601.2f). Mana abilities and
cost payment follow, with no priority or physical spending before confirmation.
The seat can remove selections, go back, or cancel. Sacrificing more permanents
than needed for the discount remains available.

The affordability search treats each optional sacrifice as a discount, not
mana. It finds whether a completion exists without enumerating subsets. The
seat still selects every sacrifice and payment. A permanent can tap for mana
and then be sacrificed. A Treasure cannot be sacrificed to both its mana
ability and the spell's cost. Costs lock while all reducing permanents remain
on the battlefield; their later sacrifice cannot change that price.

This form supports spell announcements. It does not support optional sacrifices
in resolving payments, arbitrary consequences of additional costs, or cost
increases. The mana-only plan forecast leaves these costs unpriced.

## Rottenmouth Viper

The [Bloomburrow release notes](https://magic.wizards.com/en/news/feature/bloomburrow-release-notes)
give Viper its optional casting sacrifices. Its entry and attack abilities are
the separate standing terms in [simultaneous choices](simultaneous-choices.md).
This procedure casts the permanent; it does not execute those triggers itself.

```json procedure
{
  "source": { "card": "Rottenmouth Viper", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast Rottenmouth Viper with optional sacrifices",
  "basis": "As an additional cost to cast this spell, you may sacrifice any number of nonland permanents. This spell costs {1} less to cast for each permanent sacrificed this way.",
  "timing": "spell",
  "cost": { "sacrifice": { "choose": { "zones": ["battlefield"], "controller": "you", "not": { "types": ["land"] } }, "any": true, "reduce": 1 } },
  "instructions": []
}
```
