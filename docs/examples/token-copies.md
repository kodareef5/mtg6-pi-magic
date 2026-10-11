# Token copies

`token.copy` names the permanent to copy; it replaces `token.spec`. The table
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

The first operation supports face-up, single-face permanents and ordinary
tokens. Multiple-face token copies, face-down copies, token copy exceptions and
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
  "timing": "spell", "cost": { "mana": "{3}{U}" },
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
  "timing": "spell", "cost": { "mana": "{6}{U}{U}" },
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
