# Choosing one effect as a spell resolves

"Your choice of A or B" is a choice made while the spell or ability resolves
(608.2d), not when it is cast. `choose-one` names who chooses and two or more
labelled options; the chosen option's instructions run next, in the same
resolution, against the same targets and bindings. Nothing is chosen at
announcement, so a cast offers one action whatever the later choice will be.
Splitting the card into one procedure per option would move the choice to
casting time and is not equivalent.

`as` binds the chosen option's position (1 for the first) as an amount. A modal
spell whose mode is chosen as it is cast ("Choose one —") keeps its separate
procedures or trigger `modes`.

## Practiced Offense

Both targets are announced on cast: a player whose creatures get the counters,
and one creature. Only the keyword waits for resolution. Flashback is a
standing casting permission with its own price and exile on leaving the stack;
the same procedure is cast from either zone.

```json package
{
  "card": "Practiced Offense",
  "registers": [
    { "kind": "permit", "basis": "Flashback {1}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
      "cast": { "from": ["graveyard"], "mana": "{1}{W}", "leavesStack": "exile" } }
  ],
  "procedures": [
    { "source": { "card": "Practiced Offense", "zones": ["hand", "graveyard", "exile"], "controller": "any" }, "timing": "spell",
      "claim": "Cast Practiced Offense: a +1/+1 counter on each creature target player controls, then target creature gains double strike or lifelink, chosen on resolution",
      "basis": "Put a +1/+1 counter on each creature target player controls. Target creature gains your choice of double strike or lifelink until end of turn.",
      "targets": [{ "player": "any" }, { "object": { "types": ["creature"] } }],
      "instructions": [
        { "do": "counters", "every": { "zones": ["battlefield"], "types": ["creature"], "controller": "target:0" }, "kind": "+1/+1", "amount": 1 },
        { "do": "choose-one", "who": "you", "options": [
          { "label": "double strike", "instructions": [{ "do": "modify", "what": "target:1", "change": { "words": ["double strike"] }, "until": "end-of-turn" }] },
          { "label": "lifelink", "instructions": [{ "do": "modify", "what": "target:1", "change": { "words": ["lifelink"] }, "until": "end-of-turn" }] }
        ] }
      ] }
  ],
  "assessed": true
}
```
