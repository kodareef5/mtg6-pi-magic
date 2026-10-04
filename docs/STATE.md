# Game state, replay, and export

`src/core/journal.ts` writes, replays, clones and exports games. Agreed rollback,
remote hosting and bulk simulation are unfinished. The offline circuit
inspector reads local experiment output; it is not a live spectator server.

## The file

Each game is an append-only JSONL file with a header and ordered entries.

```
{"header": { id, format, seed, seats, cards, rules, created, forkedFrom? }}
{"v":0,"receipt":{...}}
{"v":0,"prepared":{...}}
{"v":1,"row":{...}}
{"v":1,"receipt":{...}}
{"v":1,"work":{...}}
```

The header pins seat names, decks, the seed, and card/rules file dates. Replay
refuses mismatched data. Naming has its own random stream so restoring saved
names does not change the shuffle draws.

Receipts record committed changes. Ledger rows record decisions and whether
they were forced, delegated, chosen, declared or fallback. Prepared briefs and
private equipment edits are journal entries too. Executed procedures carry
their accepted basis, costs, payment, instructions and delegation, so replay
uses those terms without another interpretation call.

Cursor-only transitions write no receipt. Replay derives them from the ledger
through the normal dispatcher. This keeps the log about game events while
preserving priority and turn progression.

Each write ends with a newline. A reader drops a torn final line and refuses a
torn middle one. Resume repairs a dropped fragment before appending; otherwise
the next write would turn the fragment into a corrupt middle line.

## The different versions

| Number | Counts | Purpose |
|---|---|---|
| Frame version | physical table revisions | refuse stale answers |
| Journal `v` | answered physical decisions | select a clone point |
| Equipment revision | one seat's accepted private edits | validate preparation |
| Receipt index | committed event groups with receipts | show events since a view |

A pass can change the frame revision without writing a receipt. Several
private edits can occur at one journal version without moving a card. These
numbers cannot substitute for each other.

## Cloning and resuming

A clone copies a journal prefix under a new id and records `forkedFrom` in its
header. Replay rebuilds the position, then new players can continue it. Version
zero carries preparation before any decision; later versions select positions.
The prefix includes private equipment and accepted instructions.

`relive` applies each ledger row with its recorded reason. A fallback remains a
fallback. Execution rows also name the draft step they completed, so a torn
following equipment write cannot make replay execute that step twice.

The commands have separate meanings:

- `/magic play [seed]` creates a game.
- `/magic clone <game> <version> <id>` copies a prefix.
- `/magic resume <id>` replays that journal and continues it.

A frozen benchmark can use a journal prefix. The ability experiment also needs
its authored setup constructor: the established board was not reached by
casting those cards during ordinary play.

## Export visibility

The full journal includes every hand, library order and private plan. Export
has three modes:

- `full` copies the private journal for the operator.
- `seat <n>` renders that seat's current projection and equipment.
- `public` renders the spectator projection without private equipment.

Registered deck names and counts are public. They reveal composition, not which
hidden object has a name or which card will be drawn. Receipt descriptions use
visibility at the event, so a later reveal does not rename an earlier hidden
motion. General remembered reveals and known library regions remain unfinished.

Only a public projection belongs on a spectator URL. A future odds reader must
use the viewer's public counts and earned knowledge, never the actual hidden
arrangement. Odds arithmetic is not implemented yet.

## Rollback still needs agreement

Replay supplies reconstruction, but it does not supply consent. A live rollback
must ask every remaining seat, record the agreed point, and retain the fact
that the rollback happened. A seat cannot unlearn a card revealed before the
rollback. `rollback` still throws because that agreement and remedy flow do not
exist.

## Hosting later

A possible spectator layout is an immutable projection per frame revision,
with a small pointer to the current one:

```
/g/<id>/head
/g/<id>/<revision>.json
/g/<id>/meta.json
```

A local HTTP server could serve those files. A tunnel could expose a temporary
link, or object storage could keep finished games available. No host is selected
or implemented. Choose hosting and verify its limits when publishing is in
scope; storage does not need to change for that choice.

## Simulation later

`tools/sim.ts` parses arguments and throws at its unfinished game runner. The
core imports nothing from Pi, and the offline fixtures already run from plain
scripts. A bulk runner still needs to create games, attach players, save
journals and collect results.

Compare outcomes, ledger reasons, gaps, turns, model calls, tokens, cost and
elapsed time separately. The physical forced ratio omits calls spent navigating
private work. Exact decision-packet capture is still needed for model-quality
comparisons, including the recaps available when each decision was asked.
