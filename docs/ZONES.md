# Zones, identity, and the funny corners

What the engine knows about where things are, and the places that do not behave
like the other five. Rule numbers point at `rules/cr.tsv`.

## The engine knows everything, and a seat does not

The library is an ordered list and the engine always knows the order. Nothing is
lazy, nothing is sampled at draw time, and there is no bag.

- The **shuffle** is the only randomness in the game, and it is recorded as a
  seed plus a call count so it replays.
- A **draw** is taking the top card. It is not random.
- Setting a library order is an ordinary edit. That is how a benchmark stacks a
  deck, and nothing downstream has to know it happened.

Visibility is not a property of the state. It is a filter applied on the way
out, in `view.ts`. Conflating the two is how an engine ends up unable to tell a
fixture from a cheat.

## The seven zones, 400 to 408

| Zone | Ordered | Whose | Seen by |
|---|---|---|---|
| library | yes | per seat | nobody. Its size is public |
| hand | no | per seat | its owner |
| battlefield | no | shared | everybody |
| graveyard | yes | per seat | everybody |
| stack | yes | shared | everybody |
| exile | no | shared | everybody, usually. See below |
| command | no | shared | everybody |

Order is real state in some zones and not in others. A library and a graveyard
have a top and a bottom; a hand and the battlefield do not, and must never grow
one by accident. Ante, 407, exists and we do not implement it.

## Identity

A card that changes zones comes back as a new thing. Every note anyone made
about it is void: it was enchanted, it had counters, it was going to be
sacrificed at end of turn. A stable id plus a count that rises on every zone
change expresses "this existence of this card", and without it a creature that
dies and returns inherits the dead one's history.

**406.7 is the exception that breaks the obvious implementation.** An object
already in exile that becomes exiled again does not change zones, and is a new
object anyway. So a zone change raises an incarnation, but code that only
checks whether the zone changed will miss this one.

## Exile is not a bin

406. It is a holding area, and more is tracked about it than about any other
zone.

- Exiled cards are **face up by default and may be examined by any player at
  any time**, 406.3. It is the most public zone there is.
- A card **exiled face down** cannot be examined by anybody unless an
  instruction allows it, and **has no characteristics at all**, 406.3a. Not
  hidden characteristics. None. A face-down exiled card is not a creature, has
  no name and no mana value.
- Face-down exiled cards are kept in **separate piles by when and how they were
  exiled**, 406.4, because an instruction to choose an exiled card has to be
  answerable without naming one.
- Cards that might return are kept in separate piles by how they return, 406.5.
- "The exiled cards" and "cards exiled with this" are a **link** between an
  object and what it exiled, 406.6, and that link survives the exiling object
  leaving in some cases and not others.

So exile needs three things the other zones do not: a face-down flag that
removes characteristics rather than hiding them, a pile identity, and a link
back to whatever did the exiling. All three are notepad entries rather than
properties of the card.

## The command zone holds things that are not permanents

408. A game area for objects with an overarching effect that are not permanents
and cannot be destroyed. Emblems are created there, 408.2. In Commander,
Planechase, Vanguard, Archenemy and Conspiracy Draft, specially designated cards
start there, 408.3.

For us that means the command zone is where commanders, emblems and dungeons
live, and nothing in it is a permanent, so nothing in it is a legal target for
most things and nothing in it dies.

## Dungeons, and outside the game

309. The oddest thing in the game and worth stating in full, because it does not
fit any of the usual shapes.

- A dungeon card **begins outside the game** and is not part of a deck or a
  sideboard, 309.2.
- It enters only through the venture keyword action, 309.2a, and only into the
  command zone, 309.2b.
- It is **not a permanent, cannot be cast, and cannot leave the command zone
  except by leaving the game**, 309.2c.
- Nothing other than venturing can bring one in, 309.2d.
- One per player at a time, 309.3.
- A **venture marker** on the card tracks which room its owner is in, 309.4,
  starting on the topmost room, 309.4a.
- Each room is a triggered ability whose trigger condition is not printed,
  309.4c.
- Venturing moves the marker down, 309.5a. Venturing from the bottom room
  removes the dungeon from the game, 309.5b, and that is what completing a
  dungeon means, 309.7.

We give dungeons their own zone rather than a flag on the command zone, and
`outside` likewise. Two extra members on one type, no new mechanism, and every
other rule stays simple. The venture marker is an ordinary notepad marker, the
same one a monstrous creature uses, so a dungeon needs nothing built for it
beyond being allowed to exist.

Expect carve-outs. Some cards will not fit the bucket, and the answer is to
carve one out and record it in the gap log rather than to grow a third
mechanism.

## Other corners, briefly

**Tokens**, 111. A token exists only on the battlefield. One that leaves ceases
to exist, which is not exile: nothing returns it and nothing sees it elsewhere.
It is still a zone change, so leave-the-battlefield triggers fire.

**The stack is a zone**, 405, and the things on it are objects. A copy of a
spell exists there and never existed as a card. A spell that resolves leaves the
stack, which is a zone change, which is why a permanent entering the battlefield
is a new object from the spell that made it.

**Face-down permanents**, 708. The physical stats of a face-down permanent are
public; its identity is not. A face-down creature is a 2/2 with no name, no
types beyond creature, and no abilities, and that is its actual characteristics
rather than a mask over them.

**Double-faced cards**, 712, have a front and a back face, and which face is up
decides the characteristics. In a library or a hand it is the front face.

## What this means for the three readers

**Projection**, `view.ts`. Exile is public except for face-down piles, so a seat
sees pile sizes and how they were made. A library is a count. A hand is a count
for everyone but its owner.

**Knowledge**, `knowledge.ts`. The bottom of a library after a mulligan, a
scried card, a revealed hand: all of them are known contents at known or
unknown positions, which is what a region is for. Exile needs nothing here,
because face-up exile is public and face-down exile has no characteristics to
know.

**The journal**, `journal.ts`. It holds the real order of every zone, so it
replays exactly and so a fixture can set one. That is also why it is private: it
is the one artifact that knows everything.
