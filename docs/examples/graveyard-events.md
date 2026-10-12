# Graveyard entry and departure

`enters` and `leaves` default to the battlefield. An explicit `to: ["graveyard"]`
watches entry from anywhere, using the new card and the post-event world
(603.6c). An explicit `from: ["graveyard"]` watches departures using the prior
card and abilities before the event (603.10a). A single move can cause both a
graveyard departure and a battlefield entry; those are separate events.
`of` must name the zone its event reads. Replacement exile is not graveyard
entry. `batch: true` makes one trigger for matching cards moved together.

A watch's `triggerIf` is checked only when it would trigger. Its `if` remains
the intervening condition checked again on resolution (603.4). This does not
provide arbitrary hidden-zone events or certify the quoted interpretation.

## Bloodghast

The landfall watch explicitly operates from the graveyard. A graveyard
condition on a battlefield watch would never offer the return.

```json package
{
  "card": "Bloodghast", "printedCast": true,
  "registers": [
    { "kind": "prohibit", "basis": "This creature can't block.", "block": { "attacker": { "types": ["creature"] }, "blocker": { "is": "this" } } },
    { "kind": "continuous", "basis": "This creature has haste as long as an opponent has 10 or less life.", "affects": { "is": "this", "zones": ["battlefield"] },
      "if": { "amount": { "life": "opponent" }, "atMost": 10 }, "change": { "words": ["haste"] } },
    { "kind": "watch", "basis": "Landfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield.", "zones": ["graveyard"],
      "event": { "on": "enters", "of": { "zones": ["battlefield"], "types": ["land"], "controller": "you" } },
      "effect": { "instructions": [{ "do": "move", "what": "this", "to": "battlefield", "controller": "you", "reason": "resolve", "may": true }] } }
  ]
}
```

## Hardened Academic

Discarding pays for lifelink before the ability resolves. Returning Bloodghast
or casting Practiced Offense from the graveyard raises the separate departure
trigger. Exiling several cards together raises it once.

```json package
{
  "card": "Hardened Academic", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flying, haste", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["flying", "haste"] } },
    { "kind": "watch", "basis": "Whenever one or more cards leave your graveyard, put a +1/+1 counter on target creature you control.",
      "event": { "on": "leaves", "from": ["graveyard"], "of": { "zones": ["graveyard"], "owner": "you", "token": false }, "batch": true },
      "effect": { "targets": [{ "object": { "zones": ["battlefield"], "types": ["creature"], "controller": "you" } }],
        "instructions": [{ "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 }] } }
  ]
}
```

```json procedure
{
  "source": { "card": "Hardened Academic", "zones": ["battlefield"], "controller": "self" },
  "claim": "Discard for Hardened Academic's lifelink",
  "basis": "Discard a card: This creature gains lifelink until end of turn.",
  "timing": "stack", "cost": { "discard": 1 },
  "instructions": [{ "do": "modify", "what": "this", "change": { "words": ["lifelink"] }, "until": "end-of-turn" }]
}
```

## Moonshadow

The counter condition gates the event. It is not an intervening "if".
A dying Moonshadow no longer has this battlefield ability after the event,
so it does not trigger for its own graveyard entry. Tokens and nonpermanent
cards do not qualify.

```json package
{
  "card": "Moonshadow", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Menace", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["menace"] } },
    { "kind": "enters", "basis": "This creature enters with six -1/-1 counters on it.", "counters": { "-1/-1": 6 } },
    { "kind": "watch", "basis": "Whenever one or more permanent cards are put into your graveyard from anywhere while this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature.",
      "event": { "on": "enters", "to": ["graveyard"], "of": { "zones": ["graveyard"], "owner": "you", "types": ["artifact", "battle", "creature", "enchantment", "land", "planeswalker"], "token": false }, "batch": true },
      "triggerIf": { "amount": { "counters": "-1/-1", "on": "this" }, "atLeast": 1 },
      "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "-1/-1", "amount": -1 }] } }
  ]
}
```
