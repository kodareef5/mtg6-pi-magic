# Dividing counters before casting

Grove's Bounty chooses X, its creatures and each creature's share before costs
are paid (601.2c-d). Every target gets at least one counter. With X zero it
targets nothing. An illegal target loses its share without changing another
target's allocation (608.2b).

```json procedure
{
  "claim": "Cast Grove's Bounty with divided counters",
  "basis": "Distribute X +1/+1 counters among any number of target creatures you control. (Then exile this card. You may cast the creature later from exile.)",
  "source": { "card": "Elusive Otter // Grove's Bounty", "zones": ["hand"], "controller": "self" },
  "face": 1,
  "timing": "spell",
  "targets": [{ "object": { "types": ["creature"], "controller": "you" }, "count": "any", "divide": { "x": true } }],
  "instructions": [{ "do": "counters", "on": "target:0", "kind": "+1/+1", "amount": { "divided": 0 } }]
}
```

The target group's `divide` supplies the total. `amount.divided` reads the
recorded share for each recipient, for counters or damage. The ordinary
Adventure resolution supplies exile and the creature's later casting
permission. The example does not certify other card interpretations.
