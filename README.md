# pi-magic

A Pi package that runs a table of Magic. Core owns the seats, zones, mana,
stack, decisions and journal. Decision context gives each model seat the facts
and guidance for its current choice.

Basic-land games finish through ordinary opening and turn procedures. Prepared
ability experiments add source binding, tap and mana payments, stack responses,
and draw/discard resolution. Accepted instructions survive replay and cloning.
These experiments check execution and accounting; they do not certify card
interpretation or playing strength.

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
npm run circuits -- --out .pi/circuit-review --quiet
```

The offline scenarios preserve a reserved card, recover after losing it, and
exchange two Qiqirn Merchant activations. Open `.pi/circuit-review/index.html`
for their timelines and public board snapshots. Strategy and classifier calls
use authored doubles. `npm run smoke` uses real models and costs money.
Add `-- --trace` to save exact model requests and replies beside the journal.
These files contain private seat data and are not spectator exports.

[The equipment contract](docs/WORK.md) describes private preparation, physical
execution, resolution and their current limits. [Game state](docs/STATE.md)
describes journals, clones and exports. `AGENTS.md` holds the invariants and
build order; `design-ref/` retains earlier designs and measurements.

## Next milestone

Play two selected real Standard lists. First pin the lists, legality date,
card data and rules, then inventory the mechanics those lists require. Games
must start from ordinary deck setup, reach outcomes without missing-machinery
gaps, and replay or clone correctly. Deck legality and gameplay legality need
separate checks. Established-board fixtures and passing over unsupported cards
do not meet this target.

Casting, targets, combat, triggers, continuous effects, replacements, and
objections with remedies still need work. Smoke runs can capture decision
requests; controlled model evaluation is still needed before comparing
playing strength.
