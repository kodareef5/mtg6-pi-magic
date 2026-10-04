# Triggered abilities

A permanent watches for an event and does something when it happens. Register
the watch in its package. When the event happens, the table puts the trigger in
front of you before anyone gets priority, and you pick its targets then. You do
not have to notice it yourself.

A watch is an `event` and an `effect`. The effect's targets are chosen as the
trigger goes on the stack (603.3d); if none are legal, it is removed.

## Landfall

```json package
{
  "card": "Attercop",
  "registers": [
    { "basis": "Reach, deathtouch", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["reach", "deathtouch"] } },
    { "basis": "Landfall — Whenever a land you control enters, this creature gets +1/+1 until end of turn.", "kind": "watch",
      "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
      "effect": { "instructions": [{ "do": "modify", "what": "this", "until": "end-of-turn", "change": { "power": 1, "toughness": 1 } }] } }
  ]
}
```

Two lands entering together trigger it twice: each land is its own occurrence
(603.2c). Use `batch` only when the card says "one or more".

## When this enters, with a target

```json package
{
  "card": "Ambush Gigapede",
  "registers": [
    { "basis": "When this creature enters, target creature an opponent controls gets -2/-2 until end of turn.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "targets": [{ "object": { "types": ["creature"], "controller": "opponent" } }],
        "instructions": [{ "do": "modify", "what": "target:0", "until": "end-of-turn", "change": { "power": -2, "toughness": -2 } }] } }
  ]
}
```

Its flash is about casting it, so it goes on the cast procedure, not here; see
`baseline-overrides.md`.

## At the beginning of a step

```json package
{
  "card": "Bitterbloom Bearer",
  "registers": [
    { "basis": "Flying", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["flying"] } },
    { "basis": "At the beginning of your upkeep, you lose 1 life and create a 1/1 blue and black Faerie creature token with flying.", "kind": "watch",
      "event": { "on": "step", "step": "upkeep", "whose": "you" },
      "effect": { "instructions": [
        { "do": "life", "who": "you", "amount": -1 },
        { "do": "token", "count": 1, "spec": { "name": "Faerie", "types": ["creature"], "subtypes": ["Faerie"], "colors": ["U", "B"],
          "power": 1, "toughness": 1, "words": ["flying"] } }
      ] } }
  ]
}
```

## When something dies

A dies watch looks back at the moment before the death (603.10a), so a watch on
the creature that died still fires.

```json package
{
  "card": "Callous Inspector",
  "registers": [
    { "basis": "Menace", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["menace"] } },
    { "basis": "When this creature dies, it deals 1 damage to you. Create a Clue token.", "kind": "watch",
      "event": { "on": "dies", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "damage", "to": "you", "amount": 1, "from": "this" },
        { "do": "token", "count": 1, "spec": { "name": "Clue", "types": ["artifact"], "subtypes": ["Clue"], "colors": [] } }
      ] } }
  ]
}
```

```json package
{
  "card": "Voracious Vermin",
  "registers": [
    { "basis": "When this creature enters, create a 1/1 black Rat creature token with \"This token can't block.\"", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": 1, "spec": { "name": "Rat", "types": ["creature"], "subtypes": ["Rat"], "colors": ["B"],
        "power": 1, "toughness": 1, "words": ["can't block"] } }] } },
    { "basis": "Whenever another creature you control dies, put a +1/+1 counter on this creature.", "kind": "watch",
      "event": { "on": "dies", "of": { "types": ["creature"], "controller": "you", "other": true } },
      "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": 1 }] } }
  ]
}
```

## When this attacks

```json package
{
  "card": "Dwynen, Gilt-Leaf Daen",
  "registers": [
    { "basis": "Reach", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["reach"] } },
    { "basis": "Other Elf creatures you control get +1/+1.", "kind": "continuous",
      "affects": { "types": ["creature"], "subtypes": ["Elf"], "controller": "you", "other": true }, "change": { "power": 1, "toughness": 1 } },
    { "basis": "Whenever Dwynen attacks, you gain 1 life for each attacking Elf you control.", "kind": "watch",
      "event": { "on": "attacks", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "life", "who": "you", "amount": { "count": { "subtypes": ["Elf"], "controller": "you", "attacking": true } } }] } }
  ]
}
```

"Whenever you attack with one or more Lizards" is a player attacking, once for
the group: `{"on": "attacked-with", "of": {"subtypes": ["Lizard"], "controller": "you"}}`.

## Whenever you cast

Prowess watches your own noncreature spells.

```json package
{
  "card": "Heartfire Immolator",
  "registers": [
    { "basis": "Prowess", "kind": "watch",
      "event": { "on": "cast", "of": { "zones": ["stack"], "not": { "types": ["creature"] } }, "by": "you" },
      "effect": { "instructions": [{ "do": "modify", "what": "this", "until": "end-of-turn", "change": { "power": 1, "toughness": 1 } }] } }
  ]
}
```

Its other ability, sacrificing it for damage, is announced; see `costs.md`.

## When you do, and if

"When you do" makes a reflexive trigger during resolution (603.12). Its targets
are chosen then, so it has its own effect. An intervening "if" is a `check`,
tested when it triggers and again as it resolves (603.4).

```json package
{
  "card": "Earthbender Ascension",
  "registers": [
    { "basis": "Landfall — Whenever a land you control enters, put a quest counter on this enchantment. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control. It gains trample until end of turn.", "kind": "watch",
      "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
      "effect": { "instructions": [
        { "do": "counters", "on": "this", "kind": "quest", "amount": 1 },
        { "do": "reflect", "check": { "amount": { "counters": "quest", "on": "this" }, "atLeast": 4 },
          "effect": { "targets": [{ "object": { "types": ["creature"], "controller": "you" } }],
            "instructions": [
              { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 },
              { "do": "modify", "what": "target:0", "until": "end-of-turn", "change": { "words": ["trample"] } }
            ] } }
      ] } }
  ]
}
```

Earthbender Ascension's "when this enters" trigger earthbends; `animation.md`
shows earthbend.
