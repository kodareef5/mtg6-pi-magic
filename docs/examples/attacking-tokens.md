# Tokens that enter attacking

`token.attacking: true` asks the controller which opponent or opposing
planeswalker each token attacks (508.4). Choosing does not create part of the
group early. The completed choices create all tokens together. `tapped` is
separate: entering attacking does not itself tap a creature.

An entering attacker never declared an attack, so it does not cause an
"attacks" watch to trigger. It can be blocked when it enters before blockers
are declared. A creature entering after that declaration is unblocked. The
same combat damage rules apply to it, including the chosen planeswalker
leaving combat. Battle defenders are not supported yet.

## Mobilize and the next end step

The binding names the exact tokens created. The delayed sacrifice keeps those
incarnations even if the creature with mobilize leaves the battlefield. A token
that already left is not sacrificed again. The casting restriction reads whose
turn it is from the standing registration.

```json package
{
  "card": "Voice of Victory", "printedCast": true,
  "registers": [
    {
      "kind": "watch",
      "basis": "Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)",
      "event": { "on": "attacks", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "token", "count": 2, "tapped": true, "attacking": true, "as": "mobilized",
          "spec": { "name": "Warrior Token", "types": ["creature"], "subtypes": ["Warrior"], "colors": ["R"], "power": 1, "toughness": 1 } },
        { "do": "delay", "event": { "on": "step", "step": "end", "whose": "any" },
          "effect": { "instructions": [{ "do": "move", "what": "bound:mobilized", "to": "graveyard", "reason": "sacrifice" }] } }
      ] }
    },
    { "kind": "prohibit", "basis": "Your opponents can't cast spells during your turn.", "cast": "opponent", "during": "you" }
  ]
}
```

These tokens have no activated ability. Other tokens must still carry their
complete abilities, as in [token abilities](token-abilities.md).
