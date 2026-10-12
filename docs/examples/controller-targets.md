# Targets per opponent

The Theorist's -2 names up to one artifact or creature for each opponent.
`perController: 1` limits one target group by each object's controller. Combined
with `count: "any"`, it permits zero and one target for each eligible opponent.
The object selector keeps the printed artifact-or-creature and opponent limits.
The seat chooses the targets; no opponent chooses a permanent during resolution.

```json procedure
{
  "claim": "Activate The Theorist's -2 with up to one target per opponent",
  "basis": "−2: For each opponent, return up to one target artifact or creature that player controls to its owner's hand.",
  "source": {"card": "The Theorist, Jace Beleren", "zones": ["battlefield"], "controller": "self"},
  "timing": "stack",
  "cost": {"loyalty": -2},
  "targets": [{"object": {"zones": ["battlefield"], "controller": "opponent", "types": ["artifact", "creature"]}, "count": "any", "perController": 1}],
  "instructions": [{"do": "move", "what": "target:0", "to": "hand", "reason": "resolve"}]
}
```

Each choice records the controller it names. A target must still be controlled
by that player when resolution begins. Surviving targets return together;
owners receive the cards even when their controllers differed. This follows
the pinned card and CR 601.2c, 602.2b and 608.2b. The
[release notes](https://magic.wizards.com/en/news/feature/reality-fracture-release-notes)
contain the same printed ability.

This field supports an upper bound per controller, not a required minimum for
each player, targeting players themselves, or restrictions by card type. It
does not establish support for multiplayer games as a whole.
