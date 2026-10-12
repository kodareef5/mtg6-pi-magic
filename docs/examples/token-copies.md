# Token copies

`token.copy` names the permanent or public graveyard/exiled card to copy; it replaces `token.spec`. The table
reads pinned base characteristics and accepted printed abilities (707.2), then
creates a new token with those terms. Counters, damage, tapped status, temporary
changes and later granted abilities are not copied. A token keeps its creation
terms when copied again. Copies keep mana cost and starting loyalty; ordinary
tokens omit `spec.mana` and have mana value zero.

The original's battlefield activations must have complete accepted procedures.
The copy carries them as activated registrations, including their targets, costs
and timing. Cast procedures and abilities used only outside the battlefield are
not battlefield activations. Copied entry terms apply before the token enters,
and its entry triggers wait until the current resolution finishes.

The operation supports single-face permanents, ordinary tokens, public cards,
and the nameless 2/2 base of a face-down battlefield permanent. Multiple-face token copies and
making an existing battlefield object become a copy remain unsupported.
[Entry copies](entry-copies.md) support a separate replacement choice and
additive exceptions; copying that resulting permanent retains its exceptions.
An unsupported source leaves
resolution pending with a named gap; it never becomes a token with missing text.
Copies of a departed source can read its last battlefield existence. An illegal
target supplies no copy, even if another target lets the spell resolve.

## Three Steps Ahead

Spree uses a separate procedure for each nonempty combination of paid modes.
This variant pays only the copy mode: the base U plus its additional 3.

```json procedure
{
  "source": { "card": "Three Steps Ahead", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Three Steps Ahead with only the copy mode",
  "basis": "Spree (Choose one or more additional costs.) ... + {3} — Create a token that's a copy of target artifact or creature you control.",
  "timing": "spell", "cost": { "additional": [{ "name": "spree-copy", "mana": "{3}" }] },
  "targets": [{ "object": { "types": ["artifact", "creature"], "controller": "you" } }],
  "instructions": [{ "do": "token", "count": 1, "copy": "target:0" }]
}
```

The all-modes variant costs 6UU. It counters first, copies second, then draws
two and discards one. The copy instruction has no effect if its target became
illegal while the counter target stayed legal.

```json procedure
{
  "source": { "card": "Three Steps Ahead", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Three Steps Ahead with all three modes",
  "basis": "Spree (Choose one or more additional costs.) ... + {1}{U} — Counter target spell. ... + {3} — Create a token that's a copy of target artifact or creature you control. ... + {2} — Draw two cards, then discard a card.",
  "timing": "spell", "cost": { "additional": [
    { "name": "spree-counter", "mana": "{1}{U}" },
    { "name": "spree-copy", "mana": "{3}" },
    { "name": "spree-draw", "mana": "{2}" }
  ] },
  "targets": [
    { "object": { "zones": ["stack"], "types": ["artifact", "battle", "creature", "enchantment", "instant", "planeswalker", "sorcery"] } },
    { "object": { "types": ["artifact", "creature"], "controller": "you" } }
  ],
  "instructions": [
    { "do": "counter", "what": "target:0" },
    { "do": "token", "count": 1, "copy": "target:1" },
    { "do": "draw", "who": "you", "count": 2 },
    { "do": "choose", "who": "you", "from": { "zones": ["hand"], "controller": "you" }, "count": 1, "as": "discarded" },
    { "do": "move", "what": "bound:discarded", "to": "graveyard", "reason": "discard" }
  ]
}
```

Preparing one mode does not cover the other six combinations. Syntax acceptance
does not certify any mode's source interpretation.

## Offspring and fixed power/toughness exceptions

`token.except` replaces the copy's base power and toughness with fixed integers.
Those values are themselves copiable (707.9b); counters and later layer effects
still apply normally. The exception requires `copy`, not `spec`. It does not
identify characteristic-defining abilities. Sources with a continuous base-setting
ability remain unsupported until the syntax distinguishes characteristic-defining
abilities, which 707.9d omits when their defined values are replaced.

[Public card copies](card-copies.md) extends the same exceptions to fixed colors
and creature types. Deferred battlefield activations require preparation before
the copy continues; incomplete text is never frozen into a token.

Iridescent Vinelasher's offspring trigger checks its named additional payment
both on entry and on resolution (702.175a). The token was not cast and cannot
inherit that payment, so its own offspring ability does not trigger. It retains
the original mana cost, color, creature types and landfall ability.

```json package
{
  "card": "Iridescent Vinelasher",
  "printedCast": true,
  "registers": [
    {
      "basis": "Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)",
      "kind": "watch", "event": { "on": "enters", "of": { "is": "this" } },
      "if": { "cast": "this", "paid": "offspring" },
      "effect": { "instructions": [{ "do": "token", "count": 1, "copy": "this", "except": { "power": 1, "toughness": 1 } }] }
    },
    {
      "basis": "Landfall — Whenever a land you control enters, this creature deals 1 damage to target opponent.",
      "kind": "watch", "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
      "effect": { "targets": [{ "player": "opponent" }], "instructions": [{ "do": "damage", "to": "target:0", "amount": 1 }] }
    }
  ]
}
```

The shared printed cast supplies the unpaid variant. A separate procedure pays
offspring; neither variant creates the token during the spell's resolution.

```json procedure
{
  "source": { "card": "Iridescent Vinelasher", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast Iridescent Vinelasher with offspring",
  "basis": "Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)",
  "timing": "spell", "cost": { "additional": [{ "name": "offspring", "mana": "{2}" }] },
  "instructions": []
}
```
