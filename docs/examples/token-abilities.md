# Tokens carry their own abilities

A predefined token includes the ability defined by the rules. Naming it does
not give it that ability. `activated` registrations supply stack procedures;
mana abilities still use `mana`. A later plan can reference the listed ability
without inventing its meaning or attaching it to the card that made the token.

## A Map explores with its target

Rule 111.10s gives a Map its cost, target and sorcery timing. Under 701.44a,
the creature's controller reveals their library's top card. A land goes to
hand; otherwise the creature gets a counter and its controller may put the
revealed card into the graveyard. An empty library still takes the nonland
branch. The bound land selection retains that branch after the card moves.

```json package
{
  "card": "Spyglass Siren", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Flying", "affects": { "is": "this" }, "change": { "words": ["flying"] } },
    {
      "kind": "watch", "basis": "When this creature enters, create a Map token.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": 1, "spec": {
        "name": "Map", "types": ["artifact"], "subtypes": ["Map"], "colors": [],
        "registers": [{
          "kind": "activated", "basis": "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.",
          "cost": { "mana": "{1}", "tap": true, "sacrifice": "this" }, "speed": "sorcery",
          "effect": {
            "targets": [{ "object": { "types": ["creature"], "controller": "you" } }],
            "instructions": [
              { "do": "reveal", "what": { "top": 1, "of": "you" }, "as": "top" },
              { "do": "choose", "who": "controller:target:0", "from": { "zones": ["library"], "is": "bound:top", "types": ["land"] }, "count": 1, "as": "land" },
              { "do": "move", "what": "bound:land", "to": "hand", "reason": "resolve" },
              { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1, "if": { "not": { "bound": "land" } } },
              { "do": "perform", "who": "controller:target:0", "may": true, "if": { "all": [{ "bound": "top" }, { "not": { "bound": "land" } }] },
                "instructions": [{ "do": "move", "what": "bound:top", "to": "graveyard", "reason": "resolve" }] }
            ]
          }
        }]
      } }] }
    }
  ]
}
```

These instructions perform explore's reveal, movement and counter changes.
They do not emit a named explore event; a card that watches for exploring still
needs that event support before it can join a game.

## A Clue draws after being sacrificed

Callous Inspector's death trigger deals its damage before creating the token.
Rule 111.10f gives the Clue its ability. The token pays by leaving, but its
ability remains on the stack and draws when it resolves.

```json package
{
  "card": "Callous Inspector", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Menace", "affects": { "is": "this" }, "change": { "words": ["menace"] } },
    {
      "kind": "watch", "basis": "When this creature dies, it deals 1 damage to you. Create a Clue token.",
      "event": { "on": "dies", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "damage", "to": "you", "amount": 1 },
        { "do": "token", "count": 1, "spec": {
          "name": "Clue", "types": ["artifact"], "subtypes": ["Clue"], "colors": [],
          "registers": [{ "kind": "activated", "basis": "{2}, Sacrifice this token: Draw a card.",
            "cost": { "mana": "{2}", "sacrifice": "this" },
            "effect": { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] }
          }]
        } }
      ] }
    }
  ]
}
```
