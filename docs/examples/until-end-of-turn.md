# Until end of turn, counters, and "once each turn"

`modify` with `until: "end-of-turn"` lasts until cleanup and is never stored as
a number: the table adds it in when it reads the creature. A counter is
physical and stays until the creature leaves.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Barrow Naughty" },
  "claim": "Pump Barrow Naughty",
  "basis": "{2}{B}: This creature gets +1/+0 until end of turn.",
  "timing": "stack",
  "cost": { "mana": "{2}{B}" },
  "instructions": [{ "do": "modify", "what": "this", "until": "end-of-turn", "change": { "power": 1 } }]
}
```

Its lifelink only while you control another Faerie is a conditional static:

```json package
{
  "card": "Barrow Naughty",
  "registers": [
    { "basis": "Flying", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["flying"] } },
    { "basis": "This creature has lifelink as long as you control another Faerie.", "kind": "continuous",
      "if": { "amount": { "count": { "subtypes": ["Faerie"], "controller": "you", "other": true } }, "atLeast": 1 },
      "affects": { "is": "this" }, "change": { "words": ["lifelink"] } }
  ]
}
```

## A counter and a keyword together

```json procedure
{
  "source": { "zones": ["hand"], "controller": "self", "card": "Snakeskin Veil" },
  "claim": "Cast Snakeskin Veil",
  "basis": "Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"], "controller": "you" } }],
  "instructions": [
    { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 },
    { "do": "modify", "what": "target:0", "until": "end-of-turn", "change": { "words": ["hexproof"] } }
  ]
}
```

The table records hexproof and marks the creature as a conflicting target for
the opponent. It does not hide it: an illegal target is the opponent's mistake
for you to object to.

## Doubling power

To double a creature's power, it gets +X/+0 where X is its power as the ability
resolves (701.10b). `power` is captured when the instruction applies, so later
changes do not double again.

```json package
{
  "card": "Mightform Harmonizer",
  "registers": [
    { "basis": "Landfall — Whenever a land you control enters, double the power of target creature you control until end of turn.", "kind": "watch",
      "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
      "effect": { "targets": [{ "object": { "types": ["creature"], "controller": "you" } }],
        "instructions": [{ "do": "modify", "what": "target:0", "until": "end-of-turn", "change": { "power": { "power": "target:0" } } }] } }
  ]
}
```

## "Only if" and "once each turn"

A procedure's `if` and `limit` are your own statements about when you may
announce it. The table holds you to them: it offers the ability only while they
are true.

```json procedure
{
  "source": { "zones": ["battlefield"], "controller": "self", "card": "Hired Claw" },
  "claim": "Grow Hired Claw",
  "basis": "{1}{R}: Put a +1/+1 counter on this creature. Activate only if an opponent lost life this turn and only once each turn.",
  "timing": "stack",
  "cost": { "mana": "{1}{R}" },
  "if": { "amount": { "history": "life-lost", "by": "opponent" }, "atLeast": 1 },
  "limit": "once-per-turn",
  "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": 1 }]
}
```

## Playing a card this turn

Valiant exiles the top card and lets you play it until end of turn. `permit`
adds that choice to your menus.

```json package
{
  "card": "Emberheart Challenger",
  "registers": [
    { "basis": "Haste", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["haste"] } },
    { "basis": "Prowess", "kind": "watch",
      "event": { "on": "cast", "of": { "zones": ["stack"], "not": { "types": ["creature"] } }, "by": "you" },
      "effect": { "instructions": [{ "do": "modify", "what": "this", "until": "end-of-turn", "change": { "power": 1, "toughness": 1 } }] } },
    { "basis": "Valiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, exile the top card of your library. Until end of turn, you may play that card.", "kind": "watch",
      "event": { "on": "targeted", "of": { "is": "this" }, "by": "you" }, "limit": "once-per-turn",
      "effect": { "instructions": [
        { "do": "move", "what": { "top": 1, "of": "you" }, "to": "exile", "reason": "exile", "as": "card" },
        { "do": "permit", "what": "bound:card", "who": "you", "until": "end-of-turn" }
      ] } }
  ]
}
```
