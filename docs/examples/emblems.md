# Emblems in the command zone

`emblem` gives each player named by `who` an independent object in the command
zone (114). Its `registers` are its abilities. It has no name, types, mana cost
or color, and is neither a card nor a token. Creating it causes no battlefield
entry event. Its abilities remain after the effect's original source leaves.

The operation supports continuous characteristic effects and watches. Emblem
watches function in the command zone. Other registration kinds, activated
emblem abilities and emblem copy effects remain unsupported. Accepted terms
still need source review; creating the object does not certify its abilities.

## Ajani Resolute

Ajani's life-gain trigger supplies one loyalty counter per gain event, regardless
of its amount. Each loyalty activation shares the permanent's once-per-turn
allowance. Paying the last loyalty counter puts Ajani into the graveyard at
the next state check, while his ability remains on the stack.

```json package
{
  "card": "Ajani Resolute", "printedCast": true,
  "registers": [{ "kind": "watch", "basis": "Whenever you gain life, put a loyalty counter on Ajani.",
    "event": { "on": "life-gained", "by": "you" },
    "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "loyalty", "amount": 1 }] } }]
}
```

```json procedure
{
  "source": { "card": "Ajani Resolute", "zones": ["battlefield"], "controller": "self" },
  "claim": "Ajani gains one life", "basis": "0: You gain 1 life.", "timing": "stack", "cost": { "loyalty": 0 },
  "instructions": [{ "do": "life", "who": "you", "amount": 1 }]
}
```

```json procedure
{
  "source": { "card": "Ajani Resolute", "zones": ["battlefield"], "controller": "self" },
  "claim": "Ajani creates a Pridemate",
  "basis": "−4: Create a 2/2 white Cat Soldier creature token named Ajani's Pridemate with \"Whenever you gain life, put a +1/+1 counter on this token.\"",
  "timing": "stack", "cost": { "loyalty": -4 },
  "instructions": [{ "do": "token", "count": 1, "spec": {
    "name": "Ajani's Pridemate", "types": ["creature"], "subtypes": ["Cat", "Soldier"], "colors": ["W"], "power": 2, "toughness": 2,
    "registers": [{ "kind": "watch", "basis": "Whenever you gain life, put a +1/+1 counter on this token.",
      "event": { "on": "life-gained", "by": "you" },
      "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": 1 }] } }]
  } }]
}
```

```json procedure
{
  "source": { "card": "Ajani Resolute", "zones": ["battlefield"], "controller": "self" },
  "claim": "Ajani gives an emblem", "basis": "−10: You get an emblem with \"Creatures you control get +2/+2.\"",
  "timing": "stack", "cost": { "loyalty": -10 },
  "instructions": [{ "do": "emblem", "who": "you", "registers": [
    { "kind": "continuous", "basis": "Creatures you control get +2/+2.",
      "affects": { "zones": ["battlefield"], "types": ["creature"], "controller": "you" }, "change": { "power": 2, "toughness": 2 } }
  ] }]
}
```

The emblem's layer effect reads its controller's current creatures. It includes
tokens and later arrivals, excludes opposing creatures and noncreatures, and
adds to effects from other emblems. It is not a label on the original board.

## Professor Dellian Fel

An emblem's watch can use the amount and targets from its own trigger. It does
not need the original planeswalker in play. This example also exercises the
command-zone watch with a card from Jund's registered sideboard; it does not
add that sideboard to alpha games.

```json procedure
{
  "source": { "card": "Professor Dellian Fel", "zones": ["battlefield"], "controller": "self" },
  "claim": "Professor gives a life-gain emblem",
  "basis": "−6: You get an emblem with \"Whenever you gain life, target opponent loses that much life.\"",
  "timing": "stack", "cost": { "loyalty": -6 },
  "instructions": [{ "do": "emblem", "who": "you", "registers": [
    { "kind": "watch", "basis": "Whenever you gain life, target opponent loses that much life.",
      "event": { "on": "life-gained", "by": "you" },
      "effect": { "targets": [{ "player": "opponent" }],
        "instructions": [{ "do": "life", "who": "target:0", "amount": { "negate": { "event": "amount" } } }] } }
  ] }]
}
```
