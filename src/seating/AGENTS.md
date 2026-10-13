# Who answers a seat

This directory is the host's lobby and its hold on a running game, and the
wire that lets another Pi or agent answer a seat. `docs/SEATING.md` is the
reasoning for a reader with no code.

- `lobby.ts`: seats, decks, who plays first, and the two agreements.
- `hold.ts`: the host's pause, continue and directions between loops.
- `protocol.ts`: the wire's shapes and the invite. HTTP with long polling.
- `chair.ts`: a seat answered over the wire, as the host's loop sees it: a
  player that holds each ask and judges each answer against it.
- `host.ts`: the server that hands out chairs and answers their guests.
- `guest.ts`: claim a chair and follow it, driving any player.

A remote seat is a player like any other. It is not a second game loop, and if
it starts to look like one, stop. Nothing here imports `src/context/`: the
guest's model seat is built by the extension and handed to `follow` as a
player, so a person or an MCP client can be handed in the same way.

`table-seat.SKILL.md` describes the tools a seated agent will call through the
MCP adapter. It moves into `skills/` when those tools are registered, and not
before: a skill describing tools that do not exist teaches a model something
false.
