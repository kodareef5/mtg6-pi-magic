# pi-magic

A Pi package that runs a table of Magic.

pi-magic owns the table: the game type, the seats in turn order, a deck and
zones per seat, the mana pools, the stack, the legal moves, and the log. The
core also works out the facts any seat wants, such as the summary, the mana
curve and the odds a seat may infer from what it knows.

A seat is answered by a player. For a seat answered by a decision model, a
separate decision context engine chooses which slice of the game that one
decision needs and carries the guidance that keeps the choice coherent with the
turn. A seat taken by a person, a remote agent or an MCP client loads none of
that and plays through the same interface.

```
/magic play [seed]       run a game between two AI seats
/magic step              show the next decision as the seat about to answer it reads it
/magic log               decisions asked against decisions forced, and events committed
/magic cards [format]    rebuild a card list, or `universe` for all of them
```

`cards/standard.tsv` ships with the package: 5164 rows of name, cost, type,
stats and oracle text, every field checked against Scryfall. A game needs
nothing downloaded.

## State

Early, and specific. The table, the decision list, the view and the game loop
exist as running control flow with unwritten leaves. A card is a name and
nothing else, so the first game is lands, passes, draws and mulligans, which is
what proves the loop and the ledger. `AGENTS.md` holds the build order and the
list of what is missing.

Seats over a socket are written and parked in `src/seating/`, waiting on the
games being good.

`design-ref/` is the design of the game itself, written before this repo and
unchanged by it.

## Simulation

```
node tools/sim.ts -n 100 -j 4
node tools/sim.ts --from games/1759.jsonl@42 -n 20
```

The core imports nothing from Pi, so games run from a plain script. A frozen
benchmark setup is a journal prefix, which is what `--from` takes.

## Install

```
pi install npm:pi-magic
```

Pi 1.0 or newer. Checked against the extension API in
`@earendil-works/pi-coding-agent` 1.0.1.

## Develop

```
npm install
npm test      # invariants
npm run check # types
```
