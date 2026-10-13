# Seats over a socket

This directory is who answers a seat. `lobby.ts` and `hold.ts` are wired in:
the host's table before dealing, and its hold on a running game. The wire below
lets another agent take a seat at a table this Pi owns. It is written, type
checked, partly tested, and not wired in yet; milestone 2 of
`design-ref/pi-ux-plan-20261012.md` wires it.

`docs/SEATING.md` is the reasoning, written for a reader with no code. The
short version:

- Seven messages: hello, welcome, frame, act, result, over, error. A frame
  carries the view and, when it is that seat's turn, the decision.
- An invite is a capability. Whoever presents the secret first claims the seat.
- A pick carries the version of the frame it answers and a fresh actionId, which
  is what makes a stale pick, a replayed pick and a reused id tell apart.
- `judgeAct` in host.ts distinguishes acceptance, replay, id reuse, staleness
  and invalid picks. Its tests cover the parked wire; core invariants have
  their own tests.

## What wiring it in means

A remote seat is a Player like any other. It answers `answer` from a socket
instead of from a model. So the work is a server, a chair claim, and
`remotePlayer`. It is not a second game loop, and if it starts to look like one,
stop.

`table-seat.SKILL.md` describes the two tools a seated agent calls. It moves
into `skills/` when those tools get registered, and not before: a skill
describing tools that do not exist teaches a model something false.
