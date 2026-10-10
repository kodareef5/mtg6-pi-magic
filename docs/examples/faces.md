# Faces, doors, chapters and prepared copies

A card keeps its full registered name. `face` selects a printed face; `source.face`
requires that face on a permanent. Quote that face alone. These examples show
shared operations, not certified whole-card interpretations. Only the Twinmaw
package below covers every ability on its card. Other excerpts leave abilities
for the assessment to prepare or report as unsupported.

## Alternate spells

The table reads the selected face's printed cost and characteristics. It handles
an Adventure's exile permission and an Omen's shuffle after successful resolution.
Do not repeat those movements in the spell's instructions. Countering or losing
all targets does not earn either continuation.

```json package
{
  "card": "Twinmaw Stormbrood // Charring Bite",
  "assessed": true,
  "printedCast": true,
  "registers": [
    { "face": 0, "basis": "Flying", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["flying"] } },
    { "face": 0, "basis": "When this creature enters, you gain 5 life.", "kind": "watch", "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "life", "who": "you", "amount": 5 }] } }
  ],
  "procedures": [
    { "face": 1, "source": { "card": "Twinmaw Stormbrood // Charring Bite", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
      "claim": "Cast Charring Bite", "basis": "Charring Bite deals 5 damage to target creature without flying.", "timing": "spell",
      "targets": [{ "object": { "types": ["creature"], "not": { "words": ["flying"] } } }],
      "instructions": [{ "do": "damage", "to": "target:0", "amount": 5 }] }
  ]
}
```

## Room doors

`printedCast: true` selects the left ordinary permanent cast. `printedFaces: [1]`
selects the right one too. The table offers the paid unlock special action in
its controller's empty-stack main phase. A Room entering without a cast starts
with both doors locked. Registrations on a locked face do not apply.

```json package
{
  "card": "Unholy Annex // Ritual Chamber",
  "printedCast": true,
  "printedFaces": [1],
  "registers": [
    { "face": 1, "basis": "When you unlock this door, create a 6/6 black Demon creature token with flying.",
      "kind": "watch", "event": { "on": "unlocks", "face": 1, "of": { "is": "this" } },
      "effect": { "instructions": [{ "do": "token", "count": 1,
        "spec": { "name": "Demon", "types": ["creature"], "subtypes": ["Demon"], "colors": ["B"], "power": 6, "toughness": 6, "words": ["flying"] } }] } }
  ]
}
```

This excerpt still needs the left door's end-step trigger. `event.fully: true`
restricts an unlock watch to becoming fully unlocked. An effect that locks or
unlocks uses `door` with `what`, `action: "lock"` or `"unlock"`, and optional
`face`. Without `face`, the resolving player chooses an eligible door.

## Transforming and crafting

Transform keeps the same permanent. Counters, damage, tap state and attachments
stay. The other face's registrations become active. The table checks the source's
transformation history for its own activated, triggered and delayed abilities
(701.27f). A back face that is an instant or sorcery cannot become face up on the
battlefield.

```json procedure
{
  "face": 0,
  "source": { "card": "Jennifer Walters // The Sensational She-Hulk", "face": 0, "zones": ["battlefield"], "controller": "self" },
  "claim": "Transform Jennifer Walters",
  "basis": "{3}{G}{W}{W}: Transform Jennifer Walters. Activate only as a sorcery.",
  "timing": "stack", "speed": "sorcery", "cost": { "mana": "{3}{G}{W}{W}" },
  "instructions": [{ "do": "transform", "what": "this" }]
}
```

Craft exiles its source and material as costs. `cost.exile.source: true` adds the
source to the chosen materials and binds its resulting exile incarnation as
`bound:cost-source`. Returning it is a zone change, so entry registrations apply
to the selected face. An intervening zone change breaks that binding.

```json procedure
{
  "face": 0,
  "source": { "card": "Braided Net // Braided Quipu", "face": 0, "zones": ["battlefield"], "controller": "self" },
  "claim": "Craft Braided Net", "basis": "Craft with artifact {1}{U}",
  "timing": "stack", "speed": "sorcery",
  "cost": { "mana": "{1}{U}", "exile": { "source": true, "choose": { "zones": ["battlefield", "graveyard"], "types": ["artifact"] }, "count": 1 } },
  "instructions": [{ "do": "move", "what": "bound:cost-source", "to": "battlefield", "face": 1, "reason": "resolve" }]
}
```

Without `source: true`, the exile choice is a cost selecting only the stated
count. The table offers controlled battlefield objects and owned graveyard
cards, then the selector narrows them. A different material restriction must
still be stated; syntax acceptance does not establish that a card permits it.

## Saga chapters

The Saga subtype supplies one lore counter on entry. The table adds another at
the beginning of its controller's precombat main phase when it has chapter
abilities. Register the printed chapter numbers and their instructions; do not
add the intrinsic lore counter or final sacrifice as card instructions.

```json package
{
  "card": "Esper Origins // Summon: Esper Maduin",
  "registers": [
    { "face": 1, "kind": "chapter", "numbers": [2], "basis": "II — Add {G}{G}.",
      "effect": { "instructions": [{ "do": "mana", "who": "you", "colors": ["G", "G"] }] } }
  ]
}
```

Register every chapter. A registration with `numbers: [1, 2]` represents two
chapter symbols with the same effect. Crossing several numbers raises each
chapter separately. The final sacrifice waits until no chapter from that Saga
is waiting or on the stack. Finality counters replace a battlefield-to-graveyard
move with exile (122.1h). Read ahead remains unsupported.

## Prepare

`enters.prepared` supplies the designation on entry. The table creates one copy
of the prepare face in exile, with permission for the permanent's controller to
cast it. The actual card's back face cannot be cast. Casting the copy removes
the source's prepared designation; the permanent stays where it is.

```json package
{
  "card": "Emeritus of Ideation // Ancestral Recall",
  "registers": [
    { "face": 0, "basis": "This creature enters prepared.", "kind": "enters", "prepared": true }
  ],
  "deferred": [
    { "face": 1, "source": { "card": "Emeritus of Ideation // Ancestral Recall", "zones": ["exile"], "controller": "any" },
      "claim": "Cast Ancestral Recall", "basis": "Target player draws three cards.", "timing": "spell" }
  ]
}
```

This excerpt still needs the normal cast, flying, ward and attack trigger. The
attack trigger's accepted instructions can use `prepare` with `what: "this"`
and `prepared: true` after its optional exile is completed. Preparing a prepared
permanent does nothing. An unused copy ceases if its source leaves or becomes
unprepared. A copy already cast resolves independently.
