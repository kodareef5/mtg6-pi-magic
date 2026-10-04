# How a permanent enters

"Enters tapped" and "enters with a counter" are not things that happen after a
permanent arrives. They are how it arrives (614.1c, 614.1d). Register them as
`enters` in the package. The table applies them as part of the entering motion,
reading the permanent as it will be on the battlefield (614.12), so a land
checking "unless you control two or more other lands" does not count itself.

```json package
{
  "card": "Deathcap Glade",
  "registers": [
    { "basis": "This land enters tapped unless you control two or more other lands.", "kind": "enters", "tapped": true,
      "if": { "not": { "amount": { "count": { "types": ["land"], "controller": "you", "other": true } }, "atLeast": 2 } } },
    { "basis": "{T}: Add {B} or {G}.", "kind": "mana", "cost": { "tap": true }, "colors": ["B"] },
    { "basis": "{T}: Add {B} or {G}.", "kind": "mana", "cost": { "tap": true }, "colors": ["G"] }
  ]
}
```

```json package
{
  "card": "Ba Sing Se",
  "registers": [
    { "basis": "This land enters tapped unless you control a basic land.", "kind": "enters", "tapped": true,
      "if": { "not": { "amount": { "count": { "types": ["land"], "supertypes": ["basic"], "controller": "you" } }, "atLeast": 1 } } },
    { "basis": "{T}: Add {G}.", "kind": "mana", "cost": { "tap": true }, "colors": ["G"] }
  ]
}
```

Ba Sing Se's earthbend ability is announced, not registered; see
`animation.md`.

## Entering with counters

Mossborn Hydra is printed 0/0. Without its counter it dies as soon as it
arrives, so the entry is never left silent: with no package, its controller has
to announce that it enters with nothing.

```json package
{
  "card": "Mossborn Hydra",
  "registers": [
    { "basis": "Trample", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["trample"] } },
    { "basis": "This creature enters with a +1/+1 counter on it.", "kind": "enters", "counters": { "+1/+1": 1 } },
    { "basis": "Landfall — Whenever a land you control enters, double the number of +1/+1 counters on this creature.", "kind": "watch",
      "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
      "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": { "counters": "+1/+1", "on": "this" } }] } }
  ]
}
```

Doubling counters is adding as many as there already are (701.10e).

## How other permanents enter

With `affects`, a registration changes how other permanents enter, including an
opponent's. Zhao's makes every nonbasic land enter tapped.

```json package
{
  "card": "Zhao, the Moon Slayer",
  "registers": [
    { "basis": "Menace", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["menace"] } },
    { "basis": "Nonbasic lands enter tapped.", "kind": "enters", "affects": { "types": ["land"], "not": { "supertypes": ["basic"] } }, "tapped": true },
    { "basis": "As long as Zhao has a conqueror counter on him, nonbasic lands are Mountains.", "kind": "continuous",
      "if": { "amount": { "counters": "conqueror", "on": "this" }, "atLeast": 1 },
      "affects": { "types": ["land"], "not": { "supertypes": ["basic"] } },
      "change": { "subtypes": { "set": ["Mountain"], "of": "land" } } }
  ]
}
```

Setting a land's subtype to Mountain takes away its other abilities and gives it
"{T}: Add {R}" (305.7). The table does that. Write only the type change.
