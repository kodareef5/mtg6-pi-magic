# Static abilities and Auras

A static ability applies for as long as its permanent is on the battlefield.
Register it as `continuous`: what it `affects`, the `change`, and an `if` when it
only applies sometimes. The table reads it every time it looks at the affected
object, so a creature that enters later is affected too (611.3).

Keywords are static abilities on the object itself. Write the word as the rules
spell it, in lower case.

## A lord

Elvish Archdruid and Dwynen, in `mana.md` and `triggers.md`, give other Elves
+1/+1. Ajani's Anguish gives trample to your creatures:

```json package
{
  "card": "Ajani's Anguish",
  "registers": [
    { "basis": "Creatures you control have trample.", "kind": "continuous",
      "affects": { "types": ["creature"], "controller": "you" }, "change": { "words": ["trample"] } }
  ]
}
```

Its "deals X damage" trigger is in `x-costs.md`.

## A condition

Keen-Eyed Curator counts the card types among the cards it exiled. Its
activation exiles with `link`, so `linked` finds them later.

```json package
{
  "card": "Keen-Eyed Curator",
  "registers": [
    { "basis": "As long as there are four or more card types among cards exiled with this creature, it gets +4/+4 and has trample.", "kind": "continuous",
      "if": { "amount": { "distinct": "card-types", "among": { "zones": ["exile"], "linked": true } }, "atLeast": 4 },
      "affects": { "is": "this" }, "change": { "power": 4, "toughness": 4, "words": ["trample"] } }
  ]
}
```

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Keen-Eyed Curator" },
  "claim": "Curator exiles a card from a graveyard",
  "basis": "{1}: Exile target card from a graveyard.",
  "timing": "stack",
  "cost": { "mana": "{1}" },
  "targets": [{ "object": { "zones": ["graveyard"], "controller": "any" } }],
  "instructions": [{ "do": "move", "what": "target:0", "to": "exile", "reason": "exile", "link": true }]
}
```

## An Aura

An Aura spell targets what it will enchant, then attaches as it resolves
(303.4f). The cast is a procedure: its `attach` runs after the Aura enters.

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Angelic Destiny" },
  "claim": "Cast Angelic Destiny",
  "basis": "Enchant creature",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"] } }],
  "instructions": [{ "do": "attach", "what": "this", "to": "target:0" }]
}
```

`attached` is the enchanted creature. "Is an Angel in addition to its other
types" adds a subtype.

```json package
{
  "card": "Angelic Destiny",
  "registers": [
    { "basis": "Enchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.", "kind": "continuous",
      "affects": { "is": "attached" },
      "change": { "power": 4, "toughness": 4, "words": ["flying", "first strike"], "subtypes": { "add": ["Angel"] } } },
    { "basis": "When enchanted creature dies, return this card to its owner's hand.", "kind": "watch",
      "event": { "on": "dies", "of": { "is": "attached" } },
      "effect": { "instructions": [{ "do": "move", "what": "this", "to": "hand", "reason": "bounce" }] } }
  ]
}
```

When the enchanted creature dies, the Aura goes to the graveyard as a
state-based action (704.5m). By the time the trigger resolves, `this` is the
Aura card in the graveyard; the table follows it there (603.6).

Meltstrider's Resolve fights as it enters. `fight` is one simultaneous damage
group, and "up to one" allows no target:

```json package
{
  "card": "Meltstrider's Resolve",
  "registers": [
    { "basis": "When this Aura enters, enchanted creature fights up to one target creature an opponent controls.", "kind": "watch",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "targets": [{ "object": { "types": ["creature"], "controller": "opponent" }, "upTo": true }],
        "instructions": [{ "do": "fight", "a": "attached", "b": "target:0" }] } },
    { "basis": "Enchanted creature gets +0/+2 and can't be blocked by more than one creature.", "kind": "continuous",
      "affects": { "is": "attached" }, "change": { "toughness": 2, "words": ["can't be blocked by more than one creature"] } }
  ]
}
```

The table records "can't be blocked by more than one creature" and marks a
second blocker as conflicting with it. It does not stop the block.
