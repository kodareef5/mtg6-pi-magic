# Healing earlier damage

A standing `damage-rule` with `mode: "heal"` changes a matching damage event:
the incoming damage is still dealt, while damage already marked on the recipient
is removed. It requires an object selector in `to`. This is a replacement,
not a trigger or life gain (614.1a, 701.69a).

All damage in one simultaneous group remains marked. Multiple sources do not
heal away each other's damage. Core records the amount of earlier damage healed
once per recipient in that group's receipt. A zero-damage event heals nothing.
Deathtouch's occurrence is not undone by removing marked damage.

When healing and prevention both apply, the affected player chooses their order.
Preventing all damage first leaves no damage event to replace with healing.
Applying healing first removes earlier marked damage even if the incoming damage
is subsequently prevented. No result occurs while the replacement order is pending.
This does not add standalone healing instructions, healing triggers, damage
redirection, multipliers or finite prevention shields.

## Wolverine, Fierce Fighter

The [Marvel Super Heroes release notes](https://magic.wizards.com/en/news/feature/marvel-super-heroes-release-notes)
confirm that this ability replaces damage without using the stack and removes
marked damage. His entry fight is a separate optional-target trigger. Combat
assigns lethal using already marked damage before replacement effects apply;
healing does not rewrite those assignments (510.1c, 702.19b).

```json package
{
  "card": "Wolverine, Fierce Fighter", "printedCast": true,
  "registers": [
    { "kind": "continuous", "basis": "Haste", "affects": { "is": "this", "zones": ["battlefield", "stack"] }, "change": { "words": ["haste"] } },
    { "kind": "watch", "basis": "When Wolverine enters, he fights up to one other target creature.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "targets": [{ "object": { "zones": ["battlefield"], "types": ["creature"], "other": true }, "upTo": true }],
        "instructions": [{ "do": "fight", "a": "this", "b": "target:0" }] } },
    { "kind": "damage-rule", "basis": "If damage would be dealt to Wolverine, instead that damage is dealt, but all other damage already dealt to him is healed.",
      "mode": "heal", "to": { "object": { "is": "this", "zones": ["battlefield"] } } }
  ]
}
```
