# Physical actions earlier this turn

These history amounts count events, not objects still present. `descended`
counts permanent cards put into that player's graveyard from any zone (700.11).
A token or nonpermanent card does not count, and exiling the card afterwards
does not erase the descent. The card's normal characteristics in the graveyard
apply, so a manifested sorcery is not a permanent card there.

`entered-face-down` counts permanents entering under that player's control face
down. `turned-face-up` counts that player's face-up special actions. A later
change of control or departure does not rewrite either event. The history
carries the public action and player, without hidden names or object bindings.
It does not offer arbitrary queries over past characteristics or implement
additional ways to turn a permanent face up.

## Corpses of the Lost

The end-step watch checks descent both when it would trigger and on resolution.
The optional life payment binds whether it was paid; the return depends on that
answer. The owner receives the returned enchantment even if another player
controlled it.

```json package
{
  "card": "Corpses of the Lost",
  "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Skeletons you control get +1/+0 and have haste.", "affects": { "subtypes": ["Skeleton"], "controller": "you" }, "change": { "power": 1, "words": ["haste"] } },
    { "kind": "watch", "basis": "When this enchantment enters, create a 2/2 black Skeleton Pirate creature token.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": 1, "spec": { "name": "Skeleton Pirate Token", "types": ["creature"], "subtypes": ["Skeleton", "Pirate"], "colors": ["B"], "power": 2, "toughness": 2 } }] } },
    { "kind": "watch", "basis": "At the beginning of your end step, if you descended this turn, you may pay 1 life. If you do, return this enchantment to its owner's hand. (You descended if a permanent card was put into your graveyard from anywhere.)",
      "event": { "on": "step", "step": "end", "whose": "you" },
      "if": { "amount": { "history": "descended", "by": "you" }, "atLeast": 1 },
      "effect": { "instructions": [
        { "do": "pay", "who": "you", "may": true, "cost": { "life": 1 }, "as": "paid" },
        { "do": "move", "what": "this", "to": "hand", "reason": "bounce", "if": { "bound": "paid" } }
      ] } }
  ]
}
```

## Oblivious Bookworm

Declining the optional sequence neither draws nor discards. Accepting draws
first. A face-down entry or face-up action earlier this turn, including before
the Bookworm entered, removes only the following discard requirement.

```json package
{
  "card": "Oblivious Bookworm",
  "printedCast": true,
  "registers": [{
    "kind": "watch",
    "basis": "At the beginning of your end step, you may draw a card. If you do, discard a card unless a permanent entered the battlefield face down under your control this turn or you turned a permanent face up this turn.",
    "event": { "on": "step", "step": "end", "whose": "you" },
    "effect": { "instructions": [{ "do": "perform", "who": "you", "may": true, "instructions": [
      { "do": "draw", "who": "you", "count": 1 },
      { "do": "perform", "who": "you", "if": { "amount": { "sum": [
        { "history": "entered-face-down", "by": "you" }, { "history": "turned-face-up", "by": "you" }
      ] }, "atMost": 0 }, "instructions": [
        { "do": "choose", "who": "you", "from": { "zones": ["hand"], "owner": "you" }, "count": 1, "as": "discarded" },
        { "do": "move", "what": "bound:discarded", "to": "graveyard", "reason": "discard" }
      ] }
    ] }] }
  }]
}
```
