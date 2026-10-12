# A recorded library search

A `choose` from a whole, explicitly scoped library starts a search before it
shows any card identities. The searching player privately sees every card,
including cards that do not match. Empty libraries and finding no qualifying
card still produce a search event (701.23a-c). A `choose` from a bound inspected
window is a selection after a look; it does not search the library.

The search event records the searching player and the library's owner.
`by: opponent` with `whose: event:player` means an opponent searching their own
library. Searching somebody else's library does not satisfy that watch.

```json package
{
  "card": "Wan Shi Tong, Librarian",
  "registers": [
    { "kind": "continuous", "basis": "Flash", "affects": { "is": "this", "zones": ["hand", "graveyard", "exile", "library", "command", "outside", "stack", "battlefield"] }, "change": { "words": ["flash"] } },
    { "kind": "continuous", "basis": "Flying, vigilance", "affects": { "is": "this", "zones": ["hand", "graveyard", "exile", "library", "command", "outside", "stack", "battlefield"] }, "change": { "words": ["flying", "vigilance"] } },
    { "kind": "watch", "basis": "When Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down.",
      "event": { "on": "enters", "of": { "is": "this" } },
      "effect": { "instructions": [
        { "do": "counters", "on": "this", "kind": "+1/+1", "amount": { "x": true } },
        { "do": "draw", "who": "you", "count": { "half": { "x": true }, "round": "down" } }
      ] } },
    { "kind": "watch", "basis": "Whenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card.",
      "event": { "on": "keyword", "keyword": "search", "by": "opponent", "whose": "event:player" },
      "effect": { "instructions": [
        { "do": "counters", "on": "this", "kind": "+1/+1", "amount": 1 },
        { "do": "draw", "who": "you", "count": 1 }
      ] } }
  ]
}
```

The ordinary cast asks for X. The enters trigger reads that chosen X, adds the
counters, then draws. Its cast procedure carries the variable price and flash:

```json procedure
{
  "source": { "card": "Wan Shi Tong, Librarian", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "claim": "Cast Wan Shi Tong with X",
  "basis": "Flash",
  "timing": "spell", "speed": "instant", "cost": { "mana": "{X}{U}{U}" },
  "instructions": []
}
```

 The search trigger waits until the resolving search
effect finishes before it can go on the stack. It draws even if Wan Shi Tong
has left before the trigger resolves.

Use `perform` with `who` and `may` around an optional search and its following
moves and shuffle. Declining that group neither searches nor shuffles.
Accepting it and finding nothing does both. Repeated searches of the same
library by one player within a resolving effect count once until its shuffle
(701.23h). A quantity-only search must find as many cards as possible;
qualified hidden-zone searches permit finding fewer (701.23b-d).

New journals record the search steps. Historical journals without the search
protocol marker preserve their old selections. These terms do not implement
search replacements that restrict a search to part of a library, or simultaneous
searches by several players. Refuse those meanings until their choices exist.
