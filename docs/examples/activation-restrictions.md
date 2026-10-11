# Restricting activated abilities

Clarion Conqueror blocks every activated ability of artifacts, creatures and
planeswalkers on the battlefield, including mana abilities. It leaves abilities
already on the stack intact. A source selector identifies affected objects;
this registration does not distinguish individual non-mana abilities on one
object. The table reads it through the layers whenever an activation or payment
is offered or checked.

```json package
{
  "card": "Clarion Conqueror",
  "registers": [
    {
      "kind": "continuous", "basis": "Flying",
      "affects": { "is": "this" }, "change": { "words": ["flying"] }
    },
    {
      "kind": "prohibit", "basis": "Activated abilities of artifacts, creatures, and planeswalkers can't be activated.",
      "activate": { "zones": ["battlefield"], "types": ["artifact", "creature", "planeswalker"] }
    }
  ]
}
```

An animated Forest cannot tap for its intrinsic green mana while affected;
an ordinary Forest can. Losing the Conqueror's abilities or removing it ends
the restriction. By contrast, Petrified Hamlet's `exceptMana: true` leaves
mana abilities usable and its chosen-name restriction reaches every zone.
Neither restriction removes deferred interpretation work from readiness.
