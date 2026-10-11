# Face-down exile and a continuing permission

Flameshape lets its controller keep looking at the two cards exiled by its
private look (406.3). The other seat and the spectator see two face-down cards.
Neither card has characteristics in exile. A permitted play reads what the
card would be face up, then exposes it when that play is confirmed (406.3a-b).
The earlier private announcement stages can be cancelled without revealing it.

`permit.while` is checked whenever the permission is used. Losing the last
Wizard suspends both spell casts and land plays. A later Wizard restores them,
even on a later turn. Ordinary timing, mana costs and land limits still apply.
`if` on the instruction would check only while resolving and is not equivalent.
"You" in `while` is the controller who granted the permission, even if `who`
names a different seat. Source, target, event and binding references in an
ongoing condition are refused until those captures are supported.

An explicit `look` carries its entitlement into face-down exile. A public
reveal does not grant that continuing private look. Moving the exiled card
elsewhere, including exiling it again as a new object, ends its old permission
and look entitlement. Uninformed selection from face-down piles and shuffling
those piles are not implemented.

```json procedure
{
  "source": {
    "card": "Gandalf, Goblins' Bane // Flameshape",
    "zones": [
      "hand",
      "exile"
    ]
  },
  "face": 1,
  "claim": "Flameshape with a continuing Wizard permission",
  "basis": "Look at the top two cards of your library and exile them face down. For as long as they remain exiled, you may play them if you control a Wizard.",
  "timing": "spell",
  "instructions": [
    {
      "do": "look",
      "who": "you",
      "what": {
        "top": 2,
        "of": "you"
      },
      "as": "looked"
    },
    {
      "do": "move",
      "what": "bound:looked",
      "to": "exile",
      "faceDown": true,
      "reason": "exile"
    },
    {
      "do": "permit",
      "what": "bound:looked",
      "who": "you",
      "until": "indefinite",
      "while": {
        "amount": {
          "count": {
            "controller": "you",
            "subtypes": [
              "Wizard"
            ]
          }
        },
        "atLeast": 1
      }
    }
  ]
}
```
