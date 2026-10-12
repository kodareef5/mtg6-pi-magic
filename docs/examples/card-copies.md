# Copying public cards

A token can copy a face-up card in a graveyard or exile. The copy reads the
card's pinned base characteristics and accepted abilities, including battlefield
activations. It does not reuse a former permanent's counters, copy effect or
casting choices. Hidden cards and multiple-face token copies remain unsupported.

`except` can set a fixed name, power, toughness, colors and `creatureTypes`.
The creature types replace only that subtype set; other card types, supertypes
and unrelated subtypes remain. The resulting values are themselves copiable
(707.9b). Sources with base-setting, color-changing or subtype-changing
registrations remain unsupported for the corresponding exception until
characteristic-defining abilities can be distinguished (707.9d).

## Ardyn, the Usurper

Ardyn targets a creature card in either graveyard. Exile happens first, and its
binding names the new incarnation. A declined or illegal target creates no
token. The 5/5 black Demon keeps the copied card's name, mana cost and abilities.
Ardyn supplies menace, lifelink and haste only while its standing effect applies.

```json package
{
  "card": "Ardyn, the Usurper", "printedCast": true,
  "registers": [
    {
      "kind": "continuous", "basis": "Demons you control have menace, lifelink, and haste.",
      "affects": { "zones": ["battlefield"], "controller": "you", "subtypes": ["Demon"] },
      "change": { "words": ["menace", "lifelink", "haste"] }
    },
    {
      "kind": "watch",
      "basis": "Starscourge — At the beginning of combat on your turn, exile up to one target creature card from a graveyard. If you exiled a card this way, create a token that's a copy of that card, except it's a 5/5 black Demon.",
      "event": { "on": "step", "step": "begin-combat", "whose": "you" },
      "effect": {
        "targets": [{ "object": { "zones": ["graveyard"], "types": ["creature"], "token": false }, "upTo": true }],
        "instructions": [
          { "do": "move", "what": "target:0", "to": "exile", "reason": "resolve", "as": "exiled" },
          { "do": "token", "count": 1, "copy": "bound:exiled", "if": { "bound": "exiled" },
            "except": { "power": 5, "toughness": 5, "colors": ["B"], "creatureTypes": ["Demon"] } }
        ]
      }
    }
  ]
}
```

## Preparing copied activations

A copy cannot freeze an unprepared battlefield activation. When a public source
has an identified deferred activation, its seat prepares that use through the
ordinary equipment path before copying continues. The resolution stays pending;
no card moves and no priority is granted by this preparation. Entry-copy choices
likewise require complete abilities for their eligible public sources.

Formidable Speaker's activation is one such use. The new token carries a
source-bound activated registration, so its controller can use it without owning
a physical Speaker. Its entry ability remains intact too.

```json procedure
{
  "claim": "Untap another permanent with Formidable Speaker",
  "basis": "{1}, {T}: Untap another target permanent.",
  "source": { "card": "Formidable Speaker", "zones": ["battlefield"], "controller": "self" },
  "timing": "stack", "cost": { "mana": "{1}", "tap": true },
  "targets": [{ "object": { "zones": ["battlefield"], "not": { "is": "this" } } }],
  "instructions": [{ "do": "untap", "what": "target:0" }]
}
```

Preparation accepts source-backed terms; it does not certify the interpretation.
Missing inventories or unsupported copy shapes still leave a named blocker.
