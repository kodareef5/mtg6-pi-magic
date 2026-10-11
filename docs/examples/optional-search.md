# An optional search is a whole sequence

Erode destroys first. Its target's former controller then chooses whether to
search their own library. That player can accept the search and find nothing
(701.23b); they still shuffle. Declining the search does not shuffle. A card
selection alone cannot distinguish these two choices.

`perform` with `may` asks its `who` whether to carry out the entire nested
sequence. The inner instructions retain their own actors and the enclosing
resolution's controller, targets and bindings. `as`, when supplied on the group,
records accepting or declining separately from the cards found inside it. A
later instruction using an inner binding must account for a declined group.
Acceptance changes no physical resource and is not a priority window.

`controller:target:0` uses last known information after the destruction. The
explicit library owner keeps the search from offering cards in another
player's library. The found land enters under the searching player's control,
even when Erode's controller chose the original target.

```json procedure
{
  "claim": "Erode with its controller's optional search",
  "source": { "card": "Erode", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "basis": "Destroy target creature or planeswalker. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.",
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature", "planeswalker"] } }],
  "instructions": [
    { "do": "destroy", "what": "target:0" },
    { "do": "perform", "who": "controller:target:0", "may": true, "instructions": [
      { "do": "choose", "who": "controller:target:0", "from": { "zones": ["library"], "owner": "controller:target:0", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "as": "land" },
      { "do": "move", "what": "bound:land", "to": "battlefield", "tapped": true, "controller": "controller:target:0", "reason": "resolve" },
      { "do": "shuffle", "who": "controller:target:0" }
    ] }
  ]
}
```
