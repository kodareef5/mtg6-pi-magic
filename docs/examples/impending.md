# Impending and conditional creature status

Impending uses a named alternative casting price, an entry replacement and
standing abilities (702.176a). It does not infer the chosen price from mana
spent. A reduced ordinary cast can spend the same amount without impending.

The permanent enters with its time counters, and its conditional type removal
already applies when entry watches inspect it. Terror of the Peaks does not
see an impending Overlord as a creature entering. The entry ability still
triggers because it refers to this permanent, not a creature.

```json package
{
  "card": "Overlord of the Balemurk", "printedCast": true,
  "registers": [
    {"kind": "enters", "basis": "Impending 5—{1}{B} (If you cast this spell for its impending cost, it enters with five time counters and isn't a creature until the last is removed. At the beginning of your end step, remove a time counter from it.)", "if": {"cast": "this", "alternative": "impending"}, "counters": {"time": 5}},
    {"kind": "continuous", "basis": "Impending 5—{1}{B} (If you cast this spell for its impending cost, it enters with five time counters and isn't a creature until the last is removed. At the beginning of your end step, remove a time counter from it.)", "affects": {"is": "this"}, "if": {"all": [{"cast": "this", "alternative": "impending"}, {"amount": {"counters": "time", "on": "this"}, "atLeast": 1}]}, "change": {"types": {"remove": ["creature"]}}},
    {"kind": "watch", "basis": "Impending 5—{1}{B} (If you cast this spell for its impending cost, it enters with five time counters and isn't a creature until the last is removed. At the beginning of your end step, remove a time counter from it.)", "event": {"on": "step", "step": "end", "whose": "you"}, "if": {"all": [{"cast": "this", "alternative": "impending"}, {"amount": {"counters": "time", "on": "this"}, "atLeast": 1}]}, "effect": {"instructions": [{"do": "counters", "on": "this", "kind": "time", "amount": -1}]}},
    {"kind": "watch", "basis": "Whenever this permanent enters or attacks, mill four cards, then you may return a non-Avatar creature card or a planeswalker card from your graveyard to your hand.", "event": {"on": "enters", "of": {"is": "this"}}, "effect": {"instructions": [{"do": "mill", "who": "you", "count": 4}, {"do": "choose", "who": "you", "from": {"zones": ["graveyard"], "owner": "you", "any": [{"types": ["creature"], "not": {"subtypes": ["Avatar"]}}, {"types": ["planeswalker"]}]}, "count": 1, "upTo": true, "as": "return"}, {"do": "move", "what": "bound:return", "to": "hand", "reason": "resolve"}]}},
    {"kind": "watch", "basis": "Whenever this permanent enters or attacks, mill four cards, then you may return a non-Avatar creature card or a planeswalker card from your graveyard to your hand.", "event": {"on": "attacks", "of": {"is": "this"}}, "effect": {"instructions": [{"do": "mill", "who": "you", "count": 4}, {"do": "choose", "who": "you", "from": {"zones": ["graveyard"], "owner": "you", "any": [{"types": ["creature"], "not": {"subtypes": ["Avatar"]}}, {"types": ["planeswalker"]}]}, "count": 1, "upTo": true, "as": "return"}, {"do": "move", "what": "bound:return", "to": "hand", "reason": "resolve"}]}}
  ]
}
```

The ordinary cast uses the shared printed price. The impending alternative is
prepared separately and still needs a permission for any nonhand zone:

```json procedure
{
  "claim": "Cast Overlord for impending",
  "source": {
    "card": "Overlord of the Balemurk",
    "zones": [
      "hand",
      "graveyard",
      "exile"
    ],
    "controller": "any"
  },
  "basis": "Impending 5—{1}{B} (If you cast this spell for its impending cost, it enters with five time counters and isn't a creature until the last is removed. At the beginning of your end step, remove a time counter from it.)",
  "timing": "spell",
  "cost": {
    "mana": "{1}{B}",
    "alternative": "impending"
  },
  "instructions": []
}
```

`change.types.remove` removes only the listed types. It retains unrelated types
and follows the usual rule for losing correlated subtypes. The impending
condition stops removing creature when no time counters remain. Adding a time
counter later reinstates it. The end-step ability checks the same condition
when it triggers and resolves; it does not run after an ordinary cast or a
noncast return. Leaving the battlefield ends that casting association.

Mill four before offering the optional graveyard return. A creature with Avatar
among its subtypes is excluded even if it has other creature types; the
planeswalker branch is independent. The attack watch uses the same ordered
instructions.

These terms do not supply ordering for competing entry replacements. Accepted
syntax and a paid alternative name do not certify the claimed card meaning.
