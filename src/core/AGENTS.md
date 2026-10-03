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

`commit` in commit.ts is the one door. Nothing else writes to a thing, a life
total, a pool, the notepad or the cursor. `table.ts` holds the shapes and the
readers over them and writes nothing. One call is one event, because a group of
simultaneous changes is one thing cards watch for: two creatures dying together
is not two deaths.

Every change is therefore recorded, can be undone as a group, and replays from
the seed.

Losses in one state-based check commit together. The table determines the
outcome after the whole group, so two simultaneous losses cannot award a win.

Control transitions use that same door and do not become events. A group that
only moves the cursor writes no receipt: no card watches a priority grant, and
`advance` rebuilds every one of them from the recorded picks, so storing them
would make the journal seven times larger to say what a replay already knows.
A transition caused by an action rides on that action's receipt.

So a frame version is the table's revision: committed groups so far, which is
every call through this door. Not the receipt count, because a pass commits and
moves no cards. Not the decision count either, because a concession, a declared
motion or a judge repair changes the table without answering a decision, and a
token that misses those accepts a pick written before them. Mana expiry, damage
cleanup and expiring notes happen inside the committed step ending. Phase
handlers propose transitions; they do not write state themselves.

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

Listing a forced action does not apply it. The loop applies the listed group
and asks again to discover cascading actions. Cleanup likewise remains pending
after a discard while the hand still exceeds its limit.

## A move carries its changes, and a seat never sees them

The opening, turn and priority handlers build internal moves: an option plus
its changes. `decisions.ts` strips those changes before returning a decision.
A seat that can read the changes can read another seat's cards.

Moves are recomputed on apply rather than carried over from the call that built
them. The loop is serial and the table has not moved, and a stashed plan is a
stale plan waiting to happen.

## A window owns its listed actions

Pregame offers declarations and bottom choices only while the opening is
unsettled. Turn obligations belong to their step: untap, draw, and cleanup
discard. Priority offers land plays only in the active seat's main phase with
an empty stack. These gates describe the offered list; declarations still use
their own conservation checks rather than the list's timing rules.

`steps.ts` names the phase and priority behavior of each step. The remaining
step list stays editable for skipped, repeated and inserted steps. Skipping a
draw step removes its priority window too. A null decision alone never means a
phase ended: it also occurs while dealing, applying a round, or granting priority.

The view carries a derived opening or turn window. Opening views name public
declarations and mulligan counts and the viewer's remaining obligation. They
do not claim that the first untap step has started.

Opening completion is derived from kept seats and outstanding bottom choices.
There is no second `done` flag to keep in step with those facts.

## Projection is the only reader

`project` in view.ts is the only thing that reads the table on a seat's behalf.
If a fact is hard to project safely, leave it out and let the seat ask, rather
than sending it and filtering afterwards.

A seat's own private information goes to that seat. Another seat's private
information goes nowhere: not to a log, not to a watcher, not to a model acting
for a third seat.

Public zones do not make face-down identities public. Receipts retain object
facts before and after their group; narration uses those facts, never a later
incarnation's visibility. A tap in a library stays unnamed after a later reveal.

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

An unusable answer is asked once more, with the reason it was refused on the
frame, because asking the identical question twice is one question. Then the
table takes the terminating option, records the row as `fallback`, and writes a
gap naming what came back. A fallback is not a choice and is never counted as
one.

The loop owns this for every kind of player. Each decision builder names its
terminating option, if one exists. A mandatory card selection has none: after
the retry, record a gap and return from `play` with null, leaving the table
pending for a player to answer on resume. Do not manufacture a discard, bottom
choice, or concession to make that case finish.

An ask or delegation whose handler is unwritten also leaves the decision pending
with a gap. It must not start an unbounded loop of unchanged questions.

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
it lands in the log or is derivable from a recorded decision, because a fact
kept anywhere else is a fact a replay invents. And the journal is private: it
holds every hand and every library, so what gets published is a projection of
it and never the thing itself.

`relive` is replay: recorded decisions applied in order with the reason each one
carried. It drives from the ledger and not from scripted players, because a
fallback is the absence of an answer and no player can produce one. A function
that replays only the rows a model answered desynchronises on the first
fallback, which is a game that cannot be forked or frozen as a fixture.

## No decision site holds state outside the table

If a decision depends on something not in the table, a snapshot taken at that
decision cannot rebuild it, and both replay and testing are gone.
