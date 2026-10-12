# Copying an announced spell

A spell copy enters the stack with the original spell's modes, targets, X,
additional costs and alternative price already chosen (707.10). It spends no
mana and is not cast. Its controller still answers resolution instructions.

```json package
{
  "card": "Sage of the Skies", "printedCast": true,
  "registers": [
    { "kind": "watch", "zones": ["stack"], "basis": "When you cast this spell, if you've cast another spell this turn, copy this spell. (The copy becomes a token.)",
      "event": { "on": "cast", "of": { "zones": ["stack"], "is": "this" }, "by": "you" },
      "if": { "amount": { "history": "cast", "by": "you", "of": { "zones": ["stack"], "not": { "is": "this" } } }, "atLeast": 1 },
      "effect": { "instructions": [{ "do": "copy-spell", "what": "this" }] } },
    { "kind": "continuous", "basis": "Flying, lifelink", "affects": { "is": "this", "zones": ["stack", "battlefield"] }, "change": { "words": ["flying", "lifelink"] } }
  ]
}
```

The history condition excludes this spell and is checked both when the ability
triggers and when it resolves. Countering the original Sage does not counter
its trigger: the non-targeted reference can copy its last stack existence.
The copy does not trigger the cast ability again.

A resolving permanent-spell copy becomes a token with the spell's copiable
values (707.10f). It enters normally, including entry choices and abilities,
but this is not a token-creation event (111.13). Other copies cease outside the
stack at the next state-based check. A token keeps the usual token lifetime.

The operation does not grant new targets or copy abilities. Multiple-face
spells and spell properties whose procedure/native and externally granted
provenance is not retained remain explicit blockers. Battlefield activation
terms must be prepared before freezing them in a copied permanent's abilities.
Copying a spell's accepted program does not certify its interpretation.
