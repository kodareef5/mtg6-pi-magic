# Attacking and blocking

Combat is declared one creature at a time, then finished. Nothing moves until
you finish. Then the whole declaration happens at once, and only then do attack
and block triggers fire (508.1, 509.1).

The table lists every creature that can physically attack or block. It does not
hide a block because of flying or menace. It marks a choice that conflicts with
a registered word, such as "conflicts with menace: needs two or more blockers".
Your plan should not take a marked option. If the opponent does, you can object.

Plan steps point at combat options by prefix and objects, so they never need an
object id. Red, attacking with Zhao and Kellan into one untapped Green creature:

```json plan
{
  "objective": "Push damage while Green has one blocker; Zhao's menace means it can't be blocked by one creature alone.",
  "guidance": "Attack with both. Green's single blocker can only block Kellan. If Green blocks Kellan with the Chocobo, the trade is fine.",
  "steps": [
    { "label": "Attack with Zhao", "when": { "active": "self", "step": "declare-attackers" },
      "action": { "prefix": "attack:", "objects": { "card": "Zhao, the Moon Slayer" } } },
    { "label": "Attack with Kellan", "when": { "active": "self", "step": "declare-attackers" },
      "action": { "prefix": "attack:", "objects": { "card": "Kellan, Planar Trailblazer" } } },
    { "label": "Finish attacking", "when": { "active": "self", "step": "declare-attackers" }, "action": { "option": "attack:done" } }
  ],
  "may": [],
  "askWhen": [
    { "label": "Green has two or more untapped creatures", "if": { "amount": { "count": { "types": ["creature"], "controller": "opponent", "tapped": false } }, "atLeast": 2 } }
  ],
  "packages": []
}
```

Green's side, holding back. A block plan names the blocker and the attacker:
`block:<blocker>:<attacker>` options are listed for every pair, so a step filters
by prefix and the blocker's objects. The attacker is in the label and guidance.

```json plan
{
  "objective": "Survive Red's attack without losing the Hydra.",
  "guidance": "Block Kellan with Sazh's Chocobo if Kellan attacks. Never block Zhao with one creature: menace. Never block a flier. Take the rest.",
  "steps": [
    { "label": "Block Kellan with the Chocobo", "when": { "active": "opponent", "step": "declare-blockers" },
      "if": { "amount": { "count": { "name": "Kellan, Planar Trailblazer", "attacking": true } }, "atLeast": 1 },
      "action": { "prefix": "block:", "objects": { "card": "Sazh's Chocobo" } } },
    { "label": "Finish blocking", "when": { "active": "opponent", "step": "declare-blockers" }, "action": { "option": "block:done" } }
  ],
  "may": [],
  "askWhen": [
    { "label": "Red attacks with three or more creatures", "if": { "amount": { "count": { "types": ["creature"], "controller": "opponent", "attacking": true } }, "atLeast": 3 } }
  ],
  "packages": []
}
```

## Damage

With one blocker or none, damage needs no choice. With several blockers, the
table lists every division and you pick one: there is no order and no lethal
damage owed first (510.1c). With trample, damage reaches the player only once
every blocker has lethal damage assigned, counting damage already marked
(702.19b). First strike and double strike add a damage step before the regular
one (510.4); the table runs it when a creature has the word.
