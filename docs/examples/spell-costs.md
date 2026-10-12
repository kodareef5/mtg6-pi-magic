# Standing spell reductions

A `cost` registration reduces generic mana in matching spell costs while its
source remains on the battlefield with that ability. `cast` reads the proposed
spell's characteristics on the stack. `from` restricts the card's original zone.
The source's controller supplies "you" in its selector and condition.
Reductions combine and apply to alternative prices too. They cannot remove
colored or colorless mana symbols or make the generic component negative
(118.7a, 118.9d, 601.2f). This registration does not support cost increases,
reductions of colored symbols, or activation costs. An explicit `action: "plot"`
applies the same generic reduction to plotting from hand (702.170).

## Momo's first qualifying spell

```json package
{
  "card": "Momo, Friendly Flier",
  "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flying",
      "affects": { "is": "this", "zones": ["stack", "battlefield"] },
      "change": { "words": ["flying"] } },
    { "kind": "cost",
      "basis": "The first non-Lemur creature spell with flying you cast during each of your turns costs {1} less to cast.",
      "cast": { "zones": ["stack"], "controller": "you", "types": ["creature"], "words": ["flying"], "not": { "subtypes": ["Lemur"] } },
      "reduce": 1,
      "if": { "all": [
        { "turn": "self" },
        { "amount": { "history": "cast", "by": "you", "of": { "zones": ["stack"], "types": ["creature"], "words": ["flying"], "not": { "subtypes": ["Lemur"] } } }, "atMost": 0 }
      ] } },
    { "kind": "watch",
      "basis": "Whenever another creature you control with flying enters, Momo gets +1/+1 until end of turn.",
      "event": { "on": "enters", "of": { "types": ["creature"], "controller": "you", "words": ["flying"], "not": { "is": "this" } } },
      "effect": { "instructions": [{ "do": "modify", "what": "this", "change": { "power": 1, "toughness": 1 }, "until": "end-of-turn" }] } }
  ]
}
```

Cast history includes spells cast before Momo entered and spells later countered.
A Lemur, a creature spell without flying, and an instant do not consume this
allowance. Twinmaw Stormbrood's Dragon face qualifies; Charring Bite does not.
The printed flying registration needs stack scope, as in [cast facts](cast-facts.md).
Momo's own printed cost is still W, and another player's spell gains no discount.

The resource forecast prices each ordered cast against the earlier projected
casts. A second Dragon costs its full price. Next-turn preparation starts a fresh
history; an opponent-turn response does not gain an own-turn discount. These
are labelled assumptions, not game events. An exact old payment whose discount
would change needs a new offer and has no forecast payment witness.

## Casting from a named zone

Doc Aurlock reduces two distinct actions. The default action is casting.
`action: "plot"` reduces plotting from hand; its selector reads the hand card,
not a spell on the stack. Both reductions stop at zero generic mana and keep
every colored symbol. Neither makes plotting count as casting a spell.

```json package
{
  "card": "Doc Aurlock, Grizzled Genius",
  "registers": [{
    "kind": "cost",
    "basis": "Spells you cast from your graveyard or from exile cost {2} less to cast.",
    "cast": { "zones": ["stack"], "controller": "you" },
    "from": ["graveyard", "exile"], "reduce": 2
  }, {
    "kind": "cost", "action": "plot",
    "basis": "Plotting cards from your hand costs {2} less.",
    "cast": { "zones": ["hand"], "controller": "you" },
    "from": ["hand"], "reduce": 2
  }]
}
```

The original zone remains distinct from the stack selector. A permission to cast
from exile still supplies its own timing and price; a reduction grants neither.
Source coverage and syntax acceptance do not certify the card interpretation.
