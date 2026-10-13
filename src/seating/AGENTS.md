# Who pilots a seat

This directory is the host's lobby, its hold on a running game, and a person
over a seat's AI. `docs/SEATING.md` is the reasoning for a reader with no code.

- `lobby.ts`: seats, decks, pilots, models, keys, codes, who plays first, and
  the two agreements.
- `hold.ts`: the host's pause, continue, clock and directions between loops.
- `person.ts`: a person over a seat's AI: suggest, auto and manual, stops, the
  folded menu, and numbered questions.
- `panel.ts`: the seat in words, from its own view.

The host runs every seat. A pilot is a player like any other, wrapped around
the seat's AI: it is not a second game loop, and if it starts to look like
one, stop. Nothing here imports `src/context/`: the extension makes each seat's
AI and hands it to `person` as the autopilot, so a page, a terminal or an MCP
client can pilot it the same way.
