# Damage prevention and its prohibition

A `damage-rule` registration reads its source and recipient filters at each
damage event. `mode: "prevent"` prevents all matching damage;
`mode: "unpreventable"` forbids prevention. `combat` optionally narrows either
rule. `from` selects the damage source in any zone, including its last known
characteristics; `to` holds an `object` selector or a `player` reference.
Omitted filters apply to every source and recipient.

The instruction writes a global rule lasting until `until`. It does not capture
targets or a finite shield. Neither form represents limited amounts, additional
effects attached to prevention, or triggers on prevented damage. Those uses
still require more mechanics. Acceptance checks syntax and quoted source;
it does not certify the interpretation.

## Impractical Joke

The prohibition happens before the damage and applies even when no target was
chosen. If its one chosen target becomes illegal, the spell does not resolve
and creates no prohibition (608.2b).

```json procedure
{
  "source": { "card": "Impractical Joke", "zones": ["hand"] },
  "claim": "Cast Impractical Joke",
  "basis": "Damage can't be prevented this turn. Impractical Joke deals 3 damage to up to one target creature or planeswalker.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature", "planeswalker"] }, "upTo": true }],
  "instructions": [
    { "do": "damage-rule", "mode": "unpreventable", "until": "end-of-turn" },
    { "do": "damage", "to": "target:0", "amount": 3 }
  ]
}
```

## Standing prevention

This partial package isolates Crystal Barricade's prevention. It does not
prepare defender or the controller's hexproof. Its own damage is unaffected.

```json package
{
  "card": "Crystal Barricade",
  "registers": [{
    "basis": "Prevent all noncombat damage that would be dealt to other creatures you control.",
    "kind": "damage-rule", "mode": "prevent", "combat": false,
    "to": { "object": { "types": ["creature"], "controller": "you", "other": true } }
  }]
}
```

Prevention happens before damage results, so prevented damage creates no
lifelink gain, damage trigger, marked damage or deathtouch mark (615.6).
A prohibition defeats this prevention (615.12). The receipt records how much
was prevented; it does not report that amount as damage dealt.

Sunspine Lynx supplies a standing global prohibition while it has this ability.
This partial package leaves its life-gain restriction and entry trigger unprepared.

```json package
{
  "card": "Sunspine Lynx",
  "registers": [{ "basis": "Damage can't be prevented.", "kind": "damage-rule", "mode": "unpreventable" }]
}
```
