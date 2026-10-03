# The core

The game system. Everything a seat needs no matter who is playing it.

- **The syntax compiler.** A card's structured abilities, filled in by
  interrogation. A person at a seat needs the table to know what a card does.
- **The state.** Objects and their incarnations, the seven zones, life, the mana
  pool as a bag of individual mana, stack order, the notepad, the log.
- **The judge.** Rules questions, repairs, and the ruling of last resort, with
  the Comprehensive Rules on disk so a ruling can cite rather than assert.
- **The derived facts.** The summary, the mana curve, each seat's knowledge, and
  the odds it may work out from that knowledge. A person wants these as much as
  a model does.
- **The pregame.** Compiling the decks, the mulligan procedure, and a slot for
  each seat's policy. `docs/MULLIGAN.md` is its plan.
- **The intent.** What a seat means to do at deck, turn and phase level. Held
  here and readable by whoever holds the seat. Never consulted for legality.
- **The decisions.** What is pending, the option list, legality, the turn.
- **The format.** Seat counts, starting life, hand size, singleton, the command
  zone, and which legality column decides what may be played. A second format is
  a record here before it is code anywhere.
- **The card universe.** Every card's cost, type, oracle text and legality,
  read from the file the generator writes. The compiler's source and the deck
  check's authority are the same file, so they cannot disagree.
- **Conceding, and table talk.** One is a recorded event, the other is beside
  the log because it changes nothing.

Read the root `AGENTS.md` first. These are the invariants code here must not
break, and the reason each one exists.

Two directories sit outside the core and nothing here imports from them.
`src/context/` prepares questions for a decision model. `src/seating/` carries
a seat over a socket.

## Enforce conservation, not rules

The table owns physical truth: one zone per object, identity on a zone change,
nothing spent that does not exist, and nothing shown to a seat that has not
earned it. It refuses a declaration that breaks one of those, because no ruling
afterwards can unspend a mana or unsee a card.

It does not own the rules. A cost a seat got wrong, a window it had no business
acting in, a trigger it invented: all of that commits, and any other seat may
open a case. The table does not refer a case itself and it does not police.

A missed opportunity is never a bug here. If a seat is to draw from an effect
and does not, the view said so and the seat did not do it. That is the whole of
it.

## The table is the only writer

`commit` in table.ts is the one door. Nothing else writes to a thing, a life
total, a pool or the notepad. One call is one event, because a group of
simultaneous changes is one thing cards watch for: two creatures dying together
is not two deaths.

Every change is therefore recorded, can be undone as a group, and replays from
the seed.

## nextDecision is a pure function of the table

Given a table, every pending decision can be listed without executing anything.
The order of the list is canonical, so the same table produces the same list in
the same order, so a seed plus the recorded picks replays the game exactly.

This is the one thing not to compromise. An earlier engine discovered decisions
by falling through nested async calls, which meant a decision could not be
listed, tested or replayed, and a bug in the twentieth nested branch was
unreachable from a test.

The checks inside it run in the order the rules fix, not a convenient one.
State based actions and waiting triggers are handled before anybody receives
priority. A step that cannot be detected without card meaning is absent rather
than faked, and that absence is wrong the moment a card has a trigger.

## A move carries its changes, and a seat never sees them

Inside decisions.ts a move is an option plus the changes behind it. The changes
stop at the edge of that module. A seat that can read the changes can read
another seat's cards.

Moves are recomputed on apply rather than carried over from the call that built
them. The loop is serial and the table has not moved, and a stashed plan is a
stale plan waiting to happen.

## Projection is the only reader

`project` in view.ts is the only thing that reads the table on a seat's behalf.
If a fact is hard to project safely, leave it out and let the seat ask, rather
than sending it and filtering afterwards.

A seat's own private information goes to that seat. Another seat's private
information goes nowhere: not to a log, not to a watcher, not to a model acting
for a third seat.

## The engine keeps perfect state

The library is an ordered list and the engine always knows the order. The
shuffle is the only randomness in the game; a draw is taking the top card and is
not random. Setting a library order is therefore an ordinary edit, which is how
a benchmark stacks a deck, and nothing downstream needs to know it happened.

Visibility is not a property of the state. It is a filter applied on the way
out, in `view.ts`. The engine knows where every card is; a seat is told what it
has earned. Those two facts live in different places and neither one weakens the
other.

## Identity changes on a zone change

A card that changes zones comes back as a new thing. Every note anybody made
about it is void. Raise the incarnation and drop the notes whose source
incarnation no longer matches, or a creature that dies and returns inherits the
dead one's history and effects fire that should not.

One exception, 406.7: an object already in exile that becomes exiled again does
not change zones, and is a new object anyway. So a zone change is sufficient to
raise an incarnation but not necessary, and code that keys on the zone having
changed will get that case wrong.

## Never decide for a seat by accident

An unusable answer is asked once more, and then the table takes the terminating
option, records the row as `fallback`, and writes a gap naming what came back. A
fallback is not a choice and is never counted as one.

Three things that look like helpfulness and are not. Completing an invalid
selection from whatever is left. Treating a failed operation as the seat's
decision. A configured cap that stops a seat early and then reads as though the
seat chose to stop. All three decide for the player without saying so, and all
three were in the implementation this one replaces.

## A shuffle takes order, not contents

Stated here because getting it wrong is subtle and expensive. A shuffle destroys
the arrangement and nothing else. A region of knowledge spanning a hand and a
library survives a library shuffle with its content constraint intact, because
the reveal that created it still rules out what it ruled out. A previous build
dropped those regions on shuffle and then reported a card as possibly in hand
when an earlier reveal had proved it could not be.

Knowledge accounting and the probabilities over it stay in separate files. The
arithmetic is checkable by enumeration. The accounting is where the errors live.

## The stored form is the journal

A game is a header and an append-only list of entries, in `journal.ts`. Not a
snapshot, and not a serialisation of the table. Export copies it, rollback reads
less of it, and copying a game copies a prefix, so none of those three needs an
undo path in the engine.

Two rules follow. Anything that must survive a reload goes through `commit` so
it lands in the log, because a fact kept anywhere else is a fact a replay
invents. And the journal is private: it holds every hand and every library, so
what gets published is a projection of it and never the thing itself.

## No decision site holds state outside the table

If a decision depends on something not in the table, a snapshot taken at that
decision cannot rebuild it, and both replay and testing are gone.
