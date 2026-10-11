# Entry copies

An `enters.copy` registration chooses a battlefield source before its permanent
enters. It is a replacement choice, without targets. `copy.of` reads current
characteristics for eligibility; the chosen copy keeps base characteristics and
complete printed battlefield abilities, excluding counters, damage and temporary
changes. Copied entry terms apply before entry and copied entry triggers see the
result (614.12, 707.2, 707.5).

`copy.add.creatureTypes` adds creature types when the copied base is a creature
or kindred. `copy.add.words` adds abilities. These exceptions become copiable
values (707.9a-b); later copies retain them. This supports additive creature
types and abilities, not arbitrary characteristic exceptions.

The physical card keeps an incarnation-scoped copy effect. Its characteristics
are read through the layers, and leaving the battlefield removes the effect.
A nontoken copy of a double-faced permanent copies only its current face. It
does not acquire another physical face. Creating double-faced token copies,
copying face-down permanents, ordering multiple simultaneous copy replacements
on one permanent, and copying incomplete battlefield activations remain
unsupported. Selecting an unsupported source records the choice and leaves entry
pending; it never installs an incomplete copy.

## Mockingbird

The entry limit counts mana actually spent, including the blue mana, rather than
X or the spell's mana value. A Mockingbird put onto the battlefield without being
cast has spent zero mana. Choosing not to copy leaves its printed 1/1 Bird Bard
characteristics and flying.

```json package
{
  "card": "Mockingbird",
  "registers": [
    { "basis": "Flying", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["flying"] } },
    {
      "basis": "You may have this creature enter as a copy of any creature on the battlefield with mana value less than or equal to the amount of mana spent to cast this creature, except it's a Bird in addition to its other types and it has flying.",
      "kind": "enters",
      "copy": {
        "of": { "zones": ["battlefield"], "types": ["creature"], "manaValue": { "atMost": { "manaSpent": "this" } } },
        "may": true,
        "add": { "creatureTypes": ["Bird"], "words": ["flying"] }
      }
    }
  ]
}
```

The ordinary cast chooses X and pays XU. The entry replacement, not a cast target
or an instruction after entry, supplies its copied characteristics.

```json procedure
{
  "source": { "card": "Mockingbird", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast Mockingbird for XU",
  "basis": "You may have this creature enter as a copy of any creature on the battlefield with mana value less than or equal to the amount of mana spent to cast this creature, except it's a Bird in addition to its other types and it has flying.",
  "timing": "spell", "cost": { "mana": "{X}{U}" },
  "instructions": []
}
```

For example, paying 2U can copy Mossborn Hydra at mana value three. It enters
with the Hydra's one counter, Bird and flying. It copies neither the original's
later counters nor a temporary boost. Copying an animated Soulstone Sanctuary
copies its land base: it gains flying but does not gain Bird, since that base has
no card type that can carry creature types (205.3d). The animation itself is not
copied. Becoming a creature later does not retroactively apply this exception.
