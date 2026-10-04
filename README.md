# pi-magic

A Pi package that runs a table of Magic. Core owns the seats, zones, mana,
stack, decisions and journal. Decision context gives each model seat the facts
and guidance for its current choice.

Two real Standard lists now start from ordinary deck setup for a monitored
Llanowar Elves versus Shock opening. Prepared procedures cast spells, bind
targets, pay mana, resolve instructions, and apply damage and creature deaths.
The run stops after the exchange. Accepted instructions survive replay and
cloning; full games with these lists still need substantial card machinery.

Registered deck lists are public by default. Every seat can read card counts;
hands and library order remain hidden. Odds and knowledge transitions are
unfinished. A v2 game option may support closed lists; no new settings interface
is needed now.

## Commands

```
/magic play [seed]           run a basic-land game between two model seats
/magic play [seed] circuits  enable strategy preparation and scheduled reviews
/magic step                 show the current seat's next decision
/magic work [seat]           inspect private drafts and the agenda
/magic log                   show decision reasons, events and gaps
/magic clone <game> <v> <id>  copy a journal through decision version v
/magic resume <id>           replay a journal and continue
/magic cards [format]        rebuild a card list, or universe for every format
```

`cards/standard.tsv` ships with 5164 rows of name, cost, type, stats and Oracle
text, checked against Scryfall when generated. Play needs no card download.
Socket hosting, joining and the bulk runner in `tools/sim.ts` are unfinished.

## Install

```
pi install npm:pi-magic
```

Pi 1.0 or newer. Checked against the extension API in
`@earendil-works/pi-coding-agent` 1.0.1.
From a checkout, run `node node_modules/@earendil-works/pi-coding-agent/dist/cli.js -e ./index.ts`
to use the installed dependency even if the global `pi` is older.

## Develop

```
npm install
npm test
npm run check
npm run matchup
npm run matchup -- --live
```

The matchup command monitors the first exchange between the pinned Green
Landfall and Red Aggro lists. Its default choices are authored; `--live` uses
Pi models and costs money. Both save a journal, response clone and result;
live runs also capture exact model requests and replies. The output contains
private seat data. [The matchup notes](docs/STANDARD.md) name the source lists,
supported opening and remaining mechanics. Older equipment regression scenarios
remain available through `npm run circuits`.

[The equipment contract](docs/WORK.md) describes private preparation, physical
execution, resolution and their current limits. [Game state](docs/STATE.md)
describes journals, clones and exports. `AGENTS.md` holds the invariants and
build order; `design-ref/` retains earlier designs and measurements.

## Next milestone

Finish games with the two pinned Standard lists. Their legality date, card
data, rules and mechanics inventory are recorded in the matchup notes. Games
must start from ordinary deck setup, reach outcomes without missing-machinery
gaps, and replay or clone correctly. Deck legality and gameplay legality need
separate checks. Established-board fixtures and passing over unsupported cards
do not meet this target.

Wider casting and targets, combat, triggers, continuous effects, replacements,
and objections with remedies still need work. Live runs capture decision
requests; controlled model evaluation is still needed before comparing
playing strength.
