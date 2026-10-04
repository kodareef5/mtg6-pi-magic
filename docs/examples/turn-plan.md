# A turn plan

A plan is what jev flies. Write every step you expect, in the order you will take
it, each in its window. Jev takes the step that is due when the table lists it.
It does not work out a line, so anything you leave out it will not do.

Write the plan in the order the table will ask. Triggers you cause come back to
you before priority, so a step that plays a land is followed by what you want
from its landfall triggers. Name which target each trigger should take in the
guidance.

The position: Green's third turn. Sazh's Chocobo, two Forests, Fabled Passage and
Llanowar Elves are on the battlefield. The hand is Forest, Mossborn Hydra and
Snakeskin Veil. Red has two Mountains and two cards in hand.

The line: cast the Hydra first so it sees both lands enter, play the Forest, crack
the Passage, attack with the Chocobo, and keep the new Forest open for Veil.

```json plan
{
  "objective": "Grow the Hydra to four counters this turn and keep Veil up to protect it.",
  "guidance": "Hydra before any land, so both landfalls double it: one counter becomes two, then four. Pay for it with both Forests and the Elves, never the Passage. The untapped Forest from hand is Veil mana until Green's next turn.",
  "steps": [
    { "label": "Cast Mossborn Hydra with both Forests and the Elves", "when": { "active": "self", "step": "precombat-main" },
      "action": { "prefix": "cast:", "objects": { "zones": ["hand"], "card": "Mossborn Hydra" } } },
    { "label": "Play the Forest from hand", "when": { "active": "self", "step": "precombat-main" },
      "action": { "prefix": "land:", "objects": { "zones": ["hand"], "card": "Forest" } } },
    { "label": "Crack Fabled Passage for a Forest", "when": { "active": "self", "step": "precombat-main" },
      "action": { "procedure": {
        "source": { "zones": ["battlefield"], "controller": "self", "card": "Fabled Passage" },
        "claim": "Crack Fabled Passage for a basic land",
        "basis": "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.",
        "timing": "stack",
        "cost": { "tap": true, "sacrifice": "this" },
        "instructions": [
          { "do": "choose", "who": "you", "from": { "zones": ["library"], "owner": "you", "supertypes": ["basic"], "types": ["land"] }, "count": 1, "upTo": true, "as": "land" },
          { "do": "move", "what": "bound:land", "to": "battlefield", "tapped": true, "reason": "resolve" },
          { "do": "shuffle", "who": "you" },
          { "do": "untap", "what": "bound:land", "if": { "amount": { "count": { "types": ["land"], "controller": "you" } }, "atLeast": 4 } }
        ] } } },
    { "label": "Attack with Sazh's Chocobo", "when": { "active": "self", "step": "declare-attackers" },
      "action": { "prefix": "attack:", "objects": { "card": "Sazh's Chocobo" } } },
    { "label": "Finish attacking", "when": { "active": "self", "step": "declare-attackers" }, "action": { "option": "attack:done" } }
  ],
  "may": [
    { "label": "Veil a creature Red targets", "when": { "active": "any" },
      "if": { "amount": { "count": { "zones": ["stack"], "controller": "opponent", "targeting": { "types": ["creature"], "controller": "you" } } }, "atLeast": 1 },
      "action": { "procedure": {
        "source": { "zones": ["hand"], "controller": "self", "card": "Snakeskin Veil" },
        "claim": "Cast Snakeskin Veil",
        "basis": "Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.",
        "timing": "spell",
        "targets": [{ "object": { "types": ["creature"], "controller": "you" } }],
        "instructions": [
          { "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": 1 },
          { "do": "modify", "what": "target:0", "until": "end-of-turn", "change": { "words": ["hexproof"] } }
        ] } } }
  ],
  "askWhen": [
    { "label": "The Hydra is gone before combat", "if": { "not": { "amount": { "count": { "subtypes": ["Hydra"], "controller": "you" } }, "atLeast": 1 } } },
    { "label": "Red has three or more untapped lands", "if": { "amount": { "count": { "types": ["land"], "controller": "opponent", "tapped": false } }, "atLeast": 3 } }
  ],
  "phases": [
    { "when": { "active": "self", "step": "precombat-main" }, "guidance": "Hydra first with both Forests and the Elves, then the land, then the Passage: each land doubles the Hydra. Leave the new Forest untapped for Veil." },
    { "when": { "active": "self", "step": "declare-attackers" }, "guidance": "Attack with the Chocobo only. The Hydra entered this turn and stays home." },
    { "when": { "active": "opponent" }, "guidance": "Hold the Forest for Veil. Spend it only to answer a spell aimed at the Hydra." }
  ],
  "packages": [
    { "card": "Mossborn Hydra", "registers": [
      { "basis": "Trample", "kind": "continuous", "affects": { "is": "this" }, "change": { "words": ["trample"] } },
      { "basis": "This creature enters with a +1/+1 counter on it.", "kind": "enters", "counters": { "+1/+1": 1 } },
      { "basis": "Landfall — Whenever a land you control enters, double the number of +1/+1 counters on this creature.", "kind": "watch",
        "event": { "on": "enters", "of": { "types": ["land"], "controller": "you" } },
        "effect": { "instructions": [{ "do": "counters", "on": "this", "kind": "+1/+1", "amount": { "counters": "+1/+1", "on": "this" } }] } }
    ] }
  ]
}
```

The Chocobo was already on the battlefield, so its package was attached when it
entered on an earlier turn and is not repeated here.

What the plan leaves to the table: the Veil target menu lists every creature you
control, and jev picks the one Red targeted because the `may` line says so. The
Passage search lists your basic lands; jev picks a Forest because the guidance
says so.
