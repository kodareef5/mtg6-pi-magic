# Counter directly into the replacement zone

No More Lies changes where the countered spell goes (614.1a, 701.5a). It
never visits the graveyard. `counter.to` accepts `graveyard` (the default) or
`exile`. A countered ability ceases to exist regardless of this destination.
`unless` gives the spell's controller the payment decision; paying leaves the
spell on the stack. The usual can't-be-countered conflict remains available
for the seat to respect or dispute.

`counter` with `as` binds the old stack incarnations actually countered. It does
not bind the cards that arrived in a graveyard or exile. A later move guarded
by that binding does not implement a replacement effect. Choices among
replacement destinations remain unsupported. See `ability-counter.md` for a
conditional effect on a countered ability's source.

```json procedure
{
  "claim": "Cast No More Lies, exiling the countered spell unless its controller pays three mana",
  "basis": "Counter target spell unless its controller pays {3}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
  "source": { "card": "No More Lies", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "timing": "spell", "cost": { "mana": "{W}{U}" },
  "targets": [{ "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "planeswalker", "sorcery"] } }],
  "instructions": [
    { "do": "counter", "what": "target:0", "to": "exile", "unless": { "who": "controller:target:0", "pays": { "mana": "{3}" } } }
  ]
}
```

Source coverage and syntax acceptance do not certify an interpretation.
