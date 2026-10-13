# The wire

A seat can be answered from another Pi, or by any agent that speaks HTTP. The
host's Pi owns the game; a guest claims a chair, reads what that chair may see,
and answers what it is asked. The protocol is `pi-magic/1`: JSON over HTTP
with long polling. The shapes are in `src/seating/protocol.ts`.

## How a guest sits down

1. The host sets a table and opens a seat: `/magic seat 1 open`. The table's
   server starts on the loopback address and prints one invite for that seat.
2. The guest's Pi runs `/magic join <invite>`. It now holds the chair and plays
   it with its own models and keys, under the seat the host set it up as.
3. Both agreements reach the guest. It agrees to prepare, writes its own brief
   from the public lists once the coin flip has ordered the table, sends its
   setup edits, and agrees to begin when it is ready.
4. During play the guest answers each ask once. At the end it hears the outcome
   and prints its own bill. The host never runs the guest's models and never
   pays for them.

## The invite

```
http://127.0.0.1:64810/t/6fc9163a4128#AFEUkTLL9kO8xFjCqd27MZ5ysI0HkJHVf9hnvGXq1o0
```

An invite is a capability: 32 random bytes after the `#`. Whoever presents
them first claims that chair, and the host answers with a token the guest
sends from then on. A browser, a proxy or a log line never sends or records
what follows a `#`, so an invite can travel as a link.

What a bearer invite costs: anyone who reads it before the intended guest can
take the chair. A tunnel in front of the server is what reaches another
machine, and the remote-seat plan puts an email check in front of the invite.

## The calls

| Call | Body | Answer |
|---|---|---|
| `POST /v1/claim` | protocol, table, secret, name | the token, the seat it was set up as, whether there is a judge |
| `GET /v1/state?after=<serial>` | | the chair's state, held up to 25 seconds until something it may see changes |
| `POST /v1/answer` | the ask it answers, and one answer | ok, or a refusal |
| `POST /v1/agree` | prepare or begin, yes or no | ok, or a refusal |
| `POST /v1/work` | equipment edits with their revision and actionId | ok, or a refusal; only while the game waits |

A state carries the stage, the chair's seat and every seat's public list once
the table is ordered, an agreement the host is asking for, the chair's latest
frame, the ask when the frame wants an answer, the rollback count, the turn
recaps, and the outcome when the game is over.

An answer is any answer a seat can give: a listed pick, a plan or package
edit, an objection, table talk. The same set the model seats use.

## Why an answer names its ask

Each ask has a number, and an answer names the one it answers.

- A newer ask is open: `stale`. The table moved on, and the newer state
  carries the newer ask.
- The actionId was already applied with the same answer: a replay. The game
  changes once, so a guest can resend after a dropped connection.
- The actionId was applied with a different answer: `duplicate`.
- No ask is open: `not-your-turn`.
- A pick that names no listed option: `unknown-option`.

Those five answers are the whole concurrency story. There is no lock and no
lease. A turn clock is a table rule, not part of the wire.

## What a state deliberately does not carry

Another seat's hidden cards, the seed, the library order, and the executable
changes behind an option. Frames are the host loop's projection for that one
seat, so a hidden card never reaches the wire. Registered deck lists are
public and travel by name and count.

## Not in this version

- No tunnel or email check yet. The server binds 127.0.0.1.
- No spectator chair, no person at a seat and no MCP adapter yet.
- A resumed game does not reopen a guest's seat.
