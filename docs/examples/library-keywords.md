# Library keyword actions

`keyword` with `name: "scry"` or `"surveil"`, `who` and `count` performs the
private look, selection and ordering through the ordinary resolving choices.
Scry places selected cards on the bottom in their chosen order. Surveil puts
them into the graveyard, which is not milling. Both let the player order the
remaining cards on top. Surveil selections are bottommost first in the
graveyard, so every order of the selected cards remains available. Other seats
see no private identities or library order.

Completion writes one keyword event after the final ordering choice (701.22d,
701.25d). A watch uses `on: "keyword"`, `keyword: "surveil"` and `by: "you"`,
for example. `event:player` names that player; `event.amount` is the requested
count. A positive count produces an event even if the library is empty. Count
zero produces none. Triggers wait until the whole resolving program finishes.

Optional `as` binds the cards actually placed away from the top: cards still
in the graveyard for surveil, or the selected bottom cards for scry. The bound
amount is that result count, not the requested keyword count.

These operations currently accept one player. Simultaneous private choices
and extra-card look effects remain unsupported; do not replace them with
a sequence of separate keyword actions. An ordinary look and move does not itself produce a keyword
event. Token instructions defined by a keyword rule may quote the rule-defined
token text; they need no invented printed card source.

```json procedure
{
  "claim": "Cast Opt with recorded scry completion",
  "basis": "Scry 1. (Look at the top card of your library. You may put that card on the bottom.) ... Draw a card.",
  "source": { "card": "Opt", "zones": ["hand", "graveyard", "exile"], "controller": "any" },
  "timing": "spell",
  "instructions": [
    { "do": "keyword", "name": "scry", "who": "you", "count": 1 },
    { "do": "draw", "who": "you", "count": 1 }
  ]
}
```

## Explore completion

`{ "do": "keyword", "name": "explore", "what": "this" }` explores with one
named permanent. Its controller reveals their top card, puts a land into hand,
or adds a counter and chooses whether to put the nonland into the graveyard.
The completion event identifies that permanent with `event:object` and its
controller with `event:player`, including last known information when it left
(701.44b-c). A watch uses `on:"keyword"`, `keyword:"explore"`, `of` and `by`.
An optional `as` binds the revealed card actually put in the graveyard, with
amount zero or one. Exploration still completes with an empty library.

Several permanents exploring at once require APNAP ordering choices (701.44d);
the current instruction refuses that group before revealing anything. The
Map and Amalia examples each name one permanent.
