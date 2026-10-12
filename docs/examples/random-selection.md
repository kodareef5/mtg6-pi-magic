# Random card selection

`choose.random: true` samples distinct objects uniformly without replacement.
Duplicate card names remain separate candidates. The seed advances only when
the seat carries out the instruction. The journal records the resulting
selection, and the binding remains subject to each viewer's visibility.
Selecting cards neither moves nor reveals them and is not a library search.
A following instruction performs the discard or exile as one group.

A random choice uses a fixed count, reduced only when fewer objects exist;
`upTo` and `reveal` are not combined with it. A separate reveal can follow.
Anonymous hidden selections may use scoped zones and object bindings, without
reading hidden characteristics. Identity predicates require an earned look.
This operation does not certify that the card requires a random choice.

## Casey Jones, Vigilante

The entry trigger draws first, then creates a single delayed trigger for the
controller's next upkeep. That trigger survives Casey leaving. Its three
random discards happen together, or it discards the whole hand if shorter.

```json package
{
  "card": "Casey Jones, Vigilante", "printedCast": true,
  "registers": [
    { "kind": "watch", "basis": "When Casey Jones enters, draw three cards. At the beginning of your next upkeep, discard three cards at random.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "draw", "who": "you", "count": 3 },
        { "do": "delay", "event": { "on": "step", "step": "upkeep", "whose": "you" }, "effect": { "instructions": [
          { "do": "choose", "who": "you", "from": { "zones": ["hand"], "owner": "you" }, "count": 3, "random": true, "as": "discarded" },
          { "do": "move", "what": "bound:discarded", "to": "graveyard", "reason": "discard" }
        ] } }
      ] } }
  ]
}
```

## Tersa Lightshatter

The entry discard is chosen. Its attack exile is random and requires seven
cards in the graveyard both when the ability triggers and when it resolves.
The play permission follows the exiled incarnation and ends at cleanup;
it does not grant flash or another land play.

```json package
{
  "card": "Tersa Lightshatter", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Haste", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["haste"] } },
    { "kind": "watch", "basis": "When Tersa Lightshatter enters, discard up to two cards, then draw that many cards.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "choose", "who": "you", "from": { "zones": ["hand"], "controller": "you", "owner": "you" }, "count": 2, "upTo": true, "as": "discarded" },
        { "do": "move", "what": "bound:discarded", "to": "graveyard", "reason": "discard", "as": "discarded", "countFrom": "hand" },
        { "do": "draw", "who": "you", "count": { "bound": "discarded" } }
      ] } },
    { "kind": "watch", "basis": "Whenever Tersa Lightshatter attacks, if there are seven or more cards in your graveyard, exile a card at random from your graveyard. You may play that card this turn.",
      "event": { "on": "attacks", "of": { "is": "this" } },
      "if": { "amount": { "count": { "zones": ["graveyard"], "owner": "you" } }, "atLeast": 7 },
      "effect": { "instructions": [
        { "do": "choose", "who": "you", "from": { "zones": ["graveyard"], "owner": "you" }, "count": 1, "random": true, "as": "exiled" },
        { "do": "move", "what": "bound:exiled", "to": "exile", "reason": "exile", "as": "exiled" },
        { "do": "permit", "what": "bound:exiled", "who": "you", "until": "end-of-turn" }
      ] } }
  ]
}
```
