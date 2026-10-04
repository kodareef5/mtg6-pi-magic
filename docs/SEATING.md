# The wire

The proposed `pi-magic/0` protocol uses seven messages over one WebSocket per
guest, JSON per frame. Message types and pick validation exist; socket hosting,
joining and the pending-player adapter are unfinished. This document describes
the intended wire behavior, not an available hosting command.

The host owns the game. A guest sends a pick and reads frames. There is no
negotiation, no state sharing between guests, and no path by which a guest
writes to the game except a pick the host judges.

## The invite

```
pimagic://127.0.0.1:49321/a1b2c3d4e5f6#32-random-bytes-as-base64url
```

An invite is a capability. It names a table and carries 32 random bytes.
Whoever presents those bytes first claims that chair. One invite per chair, so
handing out two invites seats two players and no guest can take a chair meant
for somebody else.

The secret sits after the `#`. A URL fragment is not sent as part of an HTTP
request, so an invite can travel through a link, a proxy or a log line that
records request paths without handing over the secret. The proposed transport dials a
WebSocket directly, where that does not yet matter. The shape is kept because
the moment an invite passes through anything HTTP shaped, it does.

What a bearer invite costs: anyone who reads the invite before the intended
guest claims the chair, and the chair cannot later prove it is the same player.
A keypair per installation fixes both, by binding the chair to a public key at
claim time and challenging a signed nonce on reconnect. That is the next step
and it is not written.

## Guest to host

**`hello`** carries the protocol string, the table id, the secret and a display
name. The host answers `welcome` or `error`.

**`act`** carries the seat, the version of the frame it answers, a fresh
`actionId`, and one option id.

## Host to guest

**`welcome`** carries the table, the game name, the chair, and the number of
chairs. One per connection.

**`frame`** carries the seat, the version, the seat's view, and a decision when
it is that seat's turn.

**`result`** answers one `act` by its `actionId`, with `ok` or a refusal.

**`over`** carries the outcome, including any clause the rules could not settle.

**`error`** refuses a connection: `bad-protocol`, `bad-invite`, `seat-taken`,
`bad-message`.

## Why a frame is one message and not two

A view and a turn notice sent separately can disagree, and then every guest
needs code for which one to believe. One message removes that question. A frame
with a decision means it is your turn, and the decision describes the same
state the view describes, at the same version.

## Why a pick carries a version and an id

The version is the frame the guest answered. The id names the attempt.

- The version moved: `stale`. The guest reads the new frame and picks again.
- The id was already applied with the same pick: the host answers from its
  record. The game changes once. A guest can resend after a dropped socket.
- The id was already applied with a different pick: `duplicate`. The host will
  not guess which pick was meant.
- The frame no longer asks this seat: `not-your-turn`.
- The id was not in the list: `unknown-option`. A correct guest never sees it.

Those five answers are the whole concurrency story. There is no lock, no lease
and no turn timer.

## What a frame deliberately does not carry

Hidden identities and executable changes behind an option. A seat sees the
source, stated costs, effects and arithmetic needed to compare choices.
Registered deck counts are public; they do not reveal hands or library order.

## Not in this version

- No rendezvous registry and no table codes. Share the invite.
- No tunnel. The host binds 127.0.0.1 by default and nothing here traverses a
  NAT. Traffic is between two processes on one machine.
- No spectator connection.
- No MCP adapter. The same seven messages would sit under one later.
