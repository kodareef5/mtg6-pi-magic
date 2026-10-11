# Damage increases and replacement order

A `damage-rule` registration with `mode: "add"` and positive integer `amount`
adds that much to each matching damage event. It shares the source, recipient
and combat filters with [prevention](prevention.md). Core reads the source's
characteristics before the event, including its last battlefield existence.
Zero damage remains zero (120.8).

```json package
{
  "card": "Valley Flamecaller",
  "printedCast": true,
  "registers": [{
    "basis": "If a Lizard, Mouse, Otter, or Raccoon you control would deal damage to a permanent or player, it deals that much damage plus 1 instead.",
    "kind": "damage-rule", "mode": "add", "amount": 1,
    "from": { "controller": "you", "subtypes": ["Lizard", "Mouse", "Otter", "Raccoon"] }
  }]
}
```

Multiple applicable replacement or prevention effects ask the affected player,
or the damaged permanent's controller, which applies next (616.1). Simultaneous
choices follow active-player, nonactive-player order. Each effect applies once
to an event (614.5). The whole damage group waits, including its life changes,
lifelink, triggers, instruction bindings and phase bookkeeping. A clone can
resume between choices without applying any damage twice.

Two Flamecallers change a Lizard's one damage into three. Against Crystal
Barricade's noncombat prevention, choosing prevention first prevents one and
ends that damage event; choosing both increases first prevents three. Both
deal zero. A prohibition on prevention still lets increases apply, and the
prevention effect applies without reducing damage (615.12).

Only fixed positive additions and prevention of all matching damage are
represented here. Their final damage is independent of order, so an instruction
can predict the recipients and amount for its `as` binding; the actual chosen
order determines the receipt's prevented amount. Multipliers, reductions,
redirection, finite shields and additional effects on prevention still require
more support. A source quote and schema acceptance do not certify the meaning.
