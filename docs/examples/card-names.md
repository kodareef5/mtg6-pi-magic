# Choosing an Oracle card name

`name-card` chooses a name from the pinned Oracle catalog and remembers it on
the named object's current incarnation. `types` filters printed card types;
the operation does not yet support other name qualifications. The catalog
includes individual faces and cards outside the game's format (201.4a-f).
It never learns names from hidden game objects.

This example covers Petrified Hamlet's name choice and granted mana ability.
Its restriction on activating other abilities still needs separate standing
terms before the complete card can be admitted to setup.

```json package
{
  "card": "Petrified Hamlet",
  "registers": [
    {
      "kind": "watch", "basis": "When this land enters, choose a land card name.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "name-card", "who": "you", "on": "this", "key": "land", "types": ["land"] }] }
    },
    {
      "kind": "continuous", "basis": "Lands with the chosen name have \"{T}: Add {C}.\"",
      "affects": { "types": ["land"], "name": { "chosen": "land" } },
      "change": { "registers": [{ "kind": "mana", "basis": "Lands with the chosen name have \"{T}: Add {C}.\"", "cost": { "tap": true }, "colors": ["C"] }] }
    },
    { "kind": "mana", "basis": "{T}: Add {C}.", "cost": { "tap": true }, "colors": ["C"] }
  ]
}
```

`name: {chosen: "land"}` matches nothing before the choice resolves. Leaving
the zone clears that incarnation's choice. A name chosen by one Hamlet does
not fill a second Hamlet's choice. Losing its continuous ability removes its
grant; no derived mana ability is stored on the affected lands.
