# Reacting on the opponent's turn

Most of the opponent's turn is passing. A reaction is a `may` option with a
window and an `if` that names what has to be on the table. Jev takes it when both
hold and passes otherwise. Write the reaction you want, not a description of the
threat.

Red, holding Shock and Lightning Strike with three Mountains, during Green's
turn:

```json plan
{
  "objective": "Kill Green's mana creature and anything that would outgrow burn, on Green's turn so Red's own mana is free on Red's turn.",
  "guidance": "Shock the Llanowar Elves at Green's upkeep. Save Lightning Strike for a Sazh's Chocobo or Mossborn Hydra with three or less toughness, in response to a land that would grow it, or at Green's end step. Never burn Green's face this turn.",
  "steps": [],
  "may": [
    { "label": "Shock the Elves in Green's upkeep", "when": { "active": "opponent", "step": "upkeep" },
      "if": { "amount": { "count": { "name": "Llanowar Elves", "controller": "opponent" } }, "atLeast": 1 },
      "action": { "procedure": {
        "source": { "zones": ["hand"], "controller": "self", "card": "Shock" },
        "claim": "Cast Shock",
        "basis": "Shock deals 2 damage to any target.",
        "timing": "spell",
        "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
        "instructions": [{ "do": "damage", "to": "target:0", "amount": 2 }] } } },
    { "label": "Lightning Strike a growing creature while its landfall trigger waits", "when": { "active": "opponent" },
      "if": { "amount": { "count": { "zones": ["stack"], "controller": "opponent" } }, "atLeast": 1 },
      "action": { "procedure": {
        "source": { "zones": ["hand"], "controller": "self", "card": "Lightning Strike" },
        "claim": "Cast Lightning Strike",
        "basis": "Lightning Strike deals 3 damage to any target.",
        "timing": "spell",
        "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
        "instructions": [{ "do": "damage", "to": "target:0", "amount": 3 }] } } }
  ],
  "askWhen": [
    { "label": "Green has a creature with four or more toughness", "if": { "amount": { "count": { "types": ["creature"], "controller": "opponent", "toughness": { "atLeast": 4 } } }, "atLeast": 1 } }
  ],
  "packages": []
}
```

The `if` on a reaction is checked against what is visible when jev has priority,
so "while its landfall trigger waits" is written as "an opponent's object is on
the stack". The guidance says which creature to aim at; the target menu lists
them all.
