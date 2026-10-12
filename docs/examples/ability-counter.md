# Counter an ability and change its source

Tishana's Tidebinder targets an activated or triggered ability on the stack.
`ability: any` includes those abilities and excludes spells. The narrower
`activated` and `triggered` selectors are also available. A mana ability does
not use the stack and cannot be selected this way.

A bare `zones: ["stack"]` includes spells and abilities. To select spells, pair
that zone with `types: ["artifact", "battle", "creature", "enchantment",
"instant", "kindred", "planeswalker", "sorcery"]`. Abilities have no card types.
Keep any printed restrictions; for example, `not: {types: ["creature"]}`
excludes creature spells. The `not` selector does not accept `ability`.

`counter` with `as` binds only the objects actually countered by the selected
option. Paying an "unless" cost or respecting "can't be countered" leaves
that binding empty. `source:bound:countered` reads the countered ability's
source. The ability may have left the stack; the source must still be the
same battlefield incarnation to receive the following modification.

```json package
{
  "card": "Tishana's Tidebinder",
  "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flash", "affects": { "is": "this", "zones": ["hand", "graveyard", "exile", "library", "command", "outside", "stack", "battlefield"] }, "change": { "words": ["flash"] } },
    { "kind": "watch", "basis": "When this creature enters, counter up to one target activated or triggered ability. If an ability of an artifact, creature, or planeswalker is countered this way, that permanent loses all abilities for as long as this creature remains on the battlefield. (Mana abilities can't be targeted.)",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": {
        "targets": [{ "object": { "zones": ["stack"], "ability": "any" }, "upTo": true }],
        "instructions": [
          { "do": "counter", "what": "target:0", "as": "countered" },
          { "do": "modify", "every": { "is": "source:bound:countered", "types": ["artifact", "creature", "planeswalker"] }, "until": "while-source", "change": { "loseAbilities": true } }
        ]
      } }
  ]
}
```

`while-source` ends when that Tidebinder incarnation leaves the battlefield.
If it has already left when the trigger resolves, the ability can still be
countered, but no ability-removal effect starts (611.2b). Losing all abilities
removes native prepared activations and mana abilities as well as registered
static and triggered abilities. An ability granted by a later effect can
still be activated through its complete registration. Losing abilities does
not remove the permanent's card types or counters.

This binding records the chosen counter operation; it does not certify that
countering was legal. A listed choice that conflicts with "can't be countered"
still carries that conflict for the players and judge.
