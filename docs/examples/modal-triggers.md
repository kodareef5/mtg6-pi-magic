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
        "name": "Human Soldier", "types": ["creature"], "subtypes": ["Human", "Soldier"], "colors": ["W"], "power": 1, "toughness": 1
      } }] },
      { "instructions": [{ "do": "counters", "every": { "types": ["creature"], "controller": "you" }, "kind": "+1/+1", "amount": 1 }] }
    ] }
  }]
}
```

Trigger policy can name the intended mode in its existing `purpose` guidance;
the pilot still chooses an offered option. This form supports one mode chosen
by the ability's controller. Choosing several modes, another player choosing,
or remembering which modes were chosen on earlier triggers remains unsupported.
Ordinal matching currently applies only to cast events. Acceptance checks the
shape and source quote, not the interpretation's rules legality.
