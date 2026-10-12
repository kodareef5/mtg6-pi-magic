# Choices before a simultaneous action

`choose-actions` asks each player named by `who` to make `count` choices in
turn order, starting with the active player. It supports sacrificing one
matching controlled permanent, discarding one card from that player's hand,
or losing a fixed amount of life. A chosen card or permanent cannot be reused.
The count is read once and the choices are recorded without moving anything.
After everyone finishes choosing, all actions occur as one group (608.2e).

Other players see that a card was chosen for discard, without its identity.
They see chosen public permanents. The private journal preserves the pending
choices for replay and clones; no player gains priority between them.
Life loss remains available even when it exceeds the player's life total.
It is not a life payment. No arbitrary instruction branches, optional stopping
or reuse of one selected resource are supported.

## Rottenmouth Viper

The [Bloomburrow release notes](https://magic.wizards.com/en/news/feature/bloomburrow-release-notes)
require all choices before the simultaneous action. They also require the last
known blight count if Viper leaves before resolution. The counter instruction
does nothing to a departed source, then `count` reads its last battlefield state.
Sacrifices and discards are choices, not targets. Losses stay separate within
the group, preserving the number of life-loss events.

The cast is identified for later preparation. Its optional sacrifice reduction
still needs variable additional-cost selection; these standing terms do not
claim that cast is fully executable.

```json package
{
  "card": "Rottenmouth Viper",
  "registers": [
    { "kind": "watch", "basis": "Whenever this creature enters or attacks, put a blight counter on it. Then for each blight counter on it, each opponent loses 4 life unless that player sacrifices a nonland permanent of their choice or discards a card.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "counters", "on": "this", "kind": "blight", "amount": 1 },
        { "do": "choose-actions", "who": "opponent", "count": { "counters": "blight", "on": "this" },
          "actions": [{ "sacrifice": { "zones": ["battlefield"], "not": { "types": ["land"] } } }, { "discard": true }, { "loseLife": 4 }] }
      ] } },
    { "kind": "watch", "basis": "Whenever this creature enters or attacks, put a blight counter on it. Then for each blight counter on it, each opponent loses 4 life unless that player sacrifices a nonland permanent of their choice or discards a card.",
      "event": { "on": "attacks", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "counters", "on": "this", "kind": "blight", "amount": 1 },
        { "do": "choose-actions", "who": "opponent", "count": { "counters": "blight", "on": "this" },
          "actions": [{ "sacrifice": { "zones": ["battlefield"], "not": { "types": ["land"] } } }, { "discard": true }, { "loseLife": 4 }] }
      ] } }
  ],
  "deferred": [{ "claim": "Cast Rottenmouth Viper with optional sacrifices", "source": { "card": "Rottenmouth Viper", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
    "timing": "spell", "basis": "As an additional cost to cast this spell, you may sacrifice any number of nonland permanents. This spell costs {1} less to cast for each permanent sacrificed this way." }]
}
```
