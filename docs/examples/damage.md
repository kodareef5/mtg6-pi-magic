# Damage and limited effects

Damage watches read what the group dealt, not marked damage or a later life
total. These examples prepare standing terms; they do not certify the card's
interpretation or supply every casting and activation procedure.

`on: "damage"` watches combat and noncombat damage. `combat: true` or `false`
narrows it. By default `of` selects the source, with one trigger per source in
the group and the sum of its damage. With `received: true`, `of` selects the
recipient and each recipient triggers once, summing all sources. `player: true`
requires a player recipient; `player: "opponent"` narrows that side. `by` still
names the source's controller. `batch: true` joins matching occurrences when
the card says "one or more".

`{event: "amount"}` reads the matched damage. `event:object` names the watched
source or recipient. `event:source` and `event:recipient` name the shared source
and permanent recipient when there is exactly one; neither chooses a first
object out of several. `event:player` names the shared damaged player. Zero
damage creates no occurrence. Damage prevention and replacement are not added
by these queries.

## Cecil's life loss and transformation

The life check belongs after the life loss, not on the watch. The half operation
states its rounding; a starting total of 21 permits transformation at 10 life.

```json package
{
  "card": "Cecil, Dark Knight // Cecil, Redeemed Paladin",
  "registers": [
    { "face": 0, "basis": "Deathtouch", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["deathtouch"] } },
    { "face": 0, "basis": "Darkness — Whenever Cecil deals damage, you lose that much life. Then if your life total is less than or equal to half your starting life total, untap Cecil and transform it.",
      "kind": "watch", "event": { "on": "damage", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "life", "who": "you", "amount": { "negate": { "event": "amount" } } },
        { "do": "untap", "what": "this", "if": { "amount": { "life": "you" }, "atMost": { "half": { "startingLife": "you" }, "round": "down" } } },
        { "do": "transform", "what": "this", "if": { "amount": { "life": "you" }, "atMost": { "half": { "startingLife": "you" }, "round": "down" } } }
      ] } },
    { "face": 1, "basis": "Lifelink", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["lifelink"] } },
    { "face": 1, "basis": "Protect — Whenever Cecil attacks, other attacking creatures gain indestructible until end of turn.",
      "kind": "watch", "event": { "on": "attacks", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "modify", "every": { "types": ["creature"], "attacking": true, "other": true }, "until": "end-of-turn", "change": { "words": ["indestructible"] } }] } }
  ]
}
```

## She-Hulk's optional use

This isolates the back face's damage trigger. Jennifer's casting restriction
and transformation activation need their own accepted terms.

```json package
{
  "card": "Jennifer Walters // The Sensational She-Hulk",
  "registers": [
    { "face": 1, "basis": "Whenever a creature you control is dealt damage, you may have The Sensational She-Hulk deal that much damage to any target. Do this only once each turn.",
      "kind": "watch", "may": true, "limit": "once-per-turn-use",
      "event": { "on": "damage", "received": true, "of": { "types": ["creature"], "controller": "you" } },
      "effect": { "targets": [{ "object": { "types": ["creature", "planeswalker", "battle"] }, "player": "any" }],
        "instructions": [{ "do": "damage", "to": "target:0", "amount": { "event": "amount" } }] } }
  ]
}
```

`once-per-turn` counts triggers. `once-per-turn-use` requires `may: true` and
limits acceptance of the whole optional effect. Declining, countering the
ability or losing all targets spends nothing. Accepting records a use for this
source incarnation, ability and controller. Later pending triggers do nothing;
new events do not trigger it again that turn (603.2h). A new incarnation and a
new turn have their own use. Instruction-local optional payments need a separate
resolution-use design; this whole-effect limit does not implement them.

## Noncombat damage to opponents

```json package
{
  "card": "Master of Barbs",
  "registers": [
    { "basis": "Menace", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["menace"] } },
    { "basis": "Whenever one or more opponents are dealt noncombat damage, creatures you control get +1/+0 until end of turn.",
      "kind": "watch", "event": { "on": "damage", "combat": false, "player": "opponent", "batch": true },
      "effect": { "instructions": [{ "do": "modify", "every": { "types": ["creature"], "controller": "you" }, "until": "end-of-turn", "change": { "power": 1 } }] } }
  ]
}
```
