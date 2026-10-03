---
name: table-seat
description: "How table_view and table_act behave when you are seated at a Magic table hosted by another Pi: what your chair can see, what a pick means, and what neither call promises."
---

# Your chair at the table

You hold one chair at a game of Magic that another Pi hosts. That host owns the
game. You own one seat in it.

## What you can see

- The view is your chair only. Public cards, your own hand and resources, the
  history anyone at the table could have watched, and the moves open to you now.
- Another player's hidden cards arrive as a count. Six unknown cards in an
  opponent's hand read as six unknown cards. You are not being asked to ignore
  information you can see. The information never reaches you.
- You cannot read the game's internal state, another chair's view, or what a
  move would do beyond what the option says.
- Nothing you learn by playing is private to you unless the view says so. A card
  you reveal is revealed.

## `table_view`

- Returns the current frame: your view, a version number, and the moves you may
  make if it is your turn.
- A frame is a snapshot. Another player can act between your call and your next
  one, so the frame you hold can be stale by the time you act on it.
- An empty move list means it is not your turn. It does not mean you have no
  moves and it does not mean you should do nothing.
- A move list of one means the rules leave one lawful answer. The host takes
  those without asking, so if you see a single option it is because the choice
  is yours to confirm, not because your alternatives were hidden.
- Calling it twice does not advance the game and does not reserve your turn.

## `table_act`

- Takes one option id, exactly as the view gave it. One id per call.
- The host built that list and checked every entry against the real game, so a
  listed id cannot be an illegal move. You cannot propose a move that is not
  listed, and you cannot write an amount, a target or a cost.
- The host refuses a pick and names why:
  - `stale`, because the table moved since your view. Read the new view and
    pick again. Your earlier reasoning may still hold, so recheck rather than
    restart.
  - `not-your-turn`, because the frame you answered no longer asks you.
  - `unknown-option`, because that id was not in the list.
  - `duplicate`, because you reused an id with a different pick.
- Resending the same pick after a dropped connection is safe. The host answers
  from its record and the game changes once.
- Accepted means the host applied your move. It does not mean the effect
  resolved. A spell you cast sits on the stack and every other player gets a
  chance to answer it before anything happens.
- The call reports nothing about what other players do next. Silence is not
  agreement and not a pass.

## What is not here

- No chat. There is no way to talk to another player, and no way to argue about
  a ruling. The table's own records settle disagreements.
- No undo. A pick the host accepted is in the record.
- No preview. You cannot ask what a move would lead to. What the option states
  is what you get to know before choosing.
- No clock. Taking a long time does not forfeit your turn, and no other player
  can act in your place.
