# Entry copies

An `enters.copy` registration chooses a public battlefield or graveyard source before its permanent
enters. It is a replacement choice, without targets. `copy.of` reads current
characteristics for eligibility; the chosen copy keeps base characteristics and
complete printed battlefield abilities, excluding counters, damage and temporary
changes. Copied entry terms apply before entry and copied entry triggers see the
result (614.12, 707.2, 707.5).

`copy.add.creatureTypes` adds creature types when the copied base is a creature
or kindred. `copy.add.words` adds abilities. These exceptions become copiable
values (707.9a-b); later copies retain them. `copy.except` can set a fixed name,
power or toughness. It does not express arbitrary characteristic exceptions.

The physical card keeps an incarnation-scoped copy effect. Its characteristics
are read through the layers, and leaving the battlefield removes the effect.
A nontoken copy of a double-faced permanent copies only its current face. It
does not acquire another physical face. A graveyard card supplies its front
characteristics and accepted battlefield abilities. Face-down permanents supply
their nameless colorless 2/2 creature values. Creating double-faced token copies,
ordering multiple simultaneous copy replacements
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

## Superior Spider-Man

This entry choice can use either player's graveyard. It does not target or
exile the chosen card as a cost. `whenCopied` supplies the linked triggered
ability, with `bound:copied` naming the exact selected incarnation. It waits
beside the new permanent's other entry triggers; its controller orders them.
The selected card remains in its graveyard until that ability resolves.

```json package
{
  "card": "Superior Spider-Man", "printedCast": true,
  "registers": [{
    "kind": "enters",
    "basis": "Mind Swap — You may have Superior Spider-Man enter as a copy of any creature card in a graveyard, except his name is Superior Spider-Man and he's a 4/4 Spider Human Hero in addition to his other types. When you do, exile that card.",
    "copy": {
      "of": { "zones": ["graveyard"], "types": ["creature"] }, "may": true,
      "except": { "name": "Superior Spider-Man", "power": 4, "toughness": 4 },
      "add": { "creatureTypes": ["Spider", "Human", "Hero"] },
      "whenCopied": { "instructions": [{ "do": "move", "what": "bound:copied", "to": "exile", "reason": "exile" }] }
    }
  }]
}
```

Copying Doomsday Excruciator makes a nonlegendary 4/4 with the retained name,
the Excruciator's mana cost, flying, Demon plus Spider Human Hero, and its entry
and upkeep abilities. Because Spider-Man was cast, the copied entry ability
also triggers. Copying Mossborn Hydra gives the fixed 4/4 base before its entry
counter. Later copies retain these exceptions, excluding counters.

If another copy effect applies afterward, it replaces these exceptions and
suppresses this linked trigger (707.9e-g). For example, copying a graveyard
Mockingbird and then choosing a battlefield creature uses the later copy's
values and leaves Mockingbird in the graveyard. Declining that later copy keeps
the first effect and its trigger. A power/toughness exception still refuses
sources whose base-setting abilities need characteristic-defining status
distinguished; it never substitutes a temporary modifier.
