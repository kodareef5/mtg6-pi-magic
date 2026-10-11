# One or two targets

A slot can hold several distinct targets. `atLeast` states a positive minimum;
`count` states the maximum. One instruction applies to the whole slot at once.
Two independent slots would allow the same target twice, and two instructions
would make the damage or returns sequential. Neither describes these modes.

## Damage to each chosen target

Prismari Charm chooses one mode. This procedure supplies only its damage mode.
The slot accepts one or two players, creatures, planeswalkers or battles. A
target that becomes illegal is dropped on resolution; a remaining legal target
still takes 1 damage (608.2b).

```json procedure
{
  "claim": "Prismari Charm deals 1 to each of one or two targets",
  "source": { "card": "Prismari Charm", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "basis": "Prismari Charm deals 1 damage to each of one or two targets.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any", "count": 2, "atLeast": 1 }],
  "instructions": [{ "do": "damage", "to": "target:0", "amount": 1 }]
}
```

## Return one or two owned permanents

Get Out's second mode checks ownership, which can differ from control. One
selector accepts either permanent type, and one move returns every chosen
target together. This procedure supplies only that mode.

```json procedure
{
  "claim": "Get Out returns one or two creatures or enchantments you own",
  "source": { "card": "Get Out", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "basis": "Return one or two target creatures and/or enchantments you own to your hand.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature", "enchantment"], "owner": "you" }, "count": 2, "atLeast": 1 }],
  "instructions": [{ "do": "move", "what": "target:0", "to": "hand", "reason": "resolve" }]
}
```
