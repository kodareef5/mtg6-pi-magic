# Modal triggers and numbered cast events

A standing watch can supply `effect.modes`, a list of complete effects. Its
controller chooses exactly one mode and that mode's targets when putting the
single triggered ability on the stack (603.3c, 700.2b). Modes without legal
targets are unavailable; if none can be chosen, the ability is removed.
The chosen instructions and targets stay fixed through responses and replay.
Modes do not become separate triggers or a choice during resolution.

`event.ordinal` matches a numbered cast by that caster during the current turn.
It counts all their spells, including earlier casts before the watcher entered,
and matches the event once. It is not an intervening condition: casting another
spell in response does not undo the trigger. Other event filters still apply,
but do not narrow the set counted by `ordinal`.

```json package
{
  "card": "Cosmogrand Zenith",
  "printedCast": true,
  "registers": [{
    "basis": "Whenever you cast your second spell each turn, choose one —\n• Create two 1/1 white Human Soldier creature tokens.\n• Put a +1/+1 counter on each creature you control.",
    "kind": "watch", "event": { "on": "cast", "by": "you", "ordinal": 2 },
    "effect": { "modes": [
      { "instructions": [{ "do": "token", "count": 2, "spec": {
        "name": "Human Soldier Token", "types": ["creature"], "subtypes": ["Human", "Soldier"], "colors": ["W"], "power": 1, "toughness": 1
      } }] },
      { "instructions": [{ "do": "counters", "every": { "types": ["creature"], "controller": "you" }, "kind": "+1/+1", "amount": 1 }] }
    ] }
  }]
}
```

Trigger policy can name the intended mode in its existing `purpose` guidance;
the pilot still chooses an offered option. This form supports one mode chosen
by the ability's controller. Choosing several modes or another player choosing
remains unsupported.
Ordinal matching currently applies only to cast events. Acceptance checks the
shape and source quote, not the interpretation's rules legality.

## Remembered modes and entry choices

`enters.choose` can supply an explicit `options` list instead of a type catalog.
The controller chooses before the entry group commits. The named value belongs
to that battlefield incarnation and is public after entry.

Numeric selector ranges can use `parity: odd`, `parity: even`, or
`parity: {chosen: key}`. A missing or unrelated choice matches nothing. Zero is
even. A cast event reads the spell's mana value on the stack, including X.

`effect.unchosen: true` restricts its modes to those not chosen for the same
ability on that source incarnation. Choosing a mode consumes it when the
trigger goes on the stack, even if the trigger is countered. The choices persist
across turns and changes of controller. Removing and returning the source gives
it a fresh incarnation. Several waiting triggers consult the choices already
put on the stack. When none remain, the ability is removed under 603.3c.

```json package
{
  "card": "Gollum, Riddle Master",
  "printedCast": true,
  "registers": [
    { "kind": "enters", "basis": "As Gollum enters, choose odd or even. (Zero is even.)",
      "choose": { "as": "quality", "options": ["odd", "even"] } },
    { "kind": "watch",
      "basis": "Whenever an opponent casts a spell with mana value of the chosen quality, choose one that hasn't been chosen —\n• Put a +1/+1 counter on Gollum.\n• Each opponent loses 2 life and you gain 2 life.\n• Draw a card.",
      "event": { "on": "cast", "by": "opponent", "of": { "zones": ["stack"], "manaValue": { "parity": { "chosen": "quality" } } } },
      "effect": { "unchosen": true, "modes": [
        { "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": 1 }] },
        { "instructions": [
          { "do": "life", "who": "opponent", "amount": -2 },
          { "do": "life", "who": "you", "amount": 2 }
        ] },
        { "instructions": [{ "do": "draw", "who": "you", "count": 1 }] }
      ] } }
  ]
}
```

This tracks choices from this source's ability. It does not implement choosing
multiple modes, transferring remembered choices to copies, or shared choices
among different sources.
