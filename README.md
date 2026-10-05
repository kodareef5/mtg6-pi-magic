# pi-magic

A Pi package that asks: can AI play Magic?

Earlier Magic emulators program every card, and managing game state and the
legality of every option that way is hard.

Casual and tournament players work differently. They move cards between zones
and watch what their opponents do, calling a judge when they disagree.

pi-magic works the same way. Instead of writing each card as a program, a small
TypeScript syntax describes Magic gameplay, and a table engine tracks the game
state.

AI playing in real time is slow and expensive. A 1v1 Standard game can take
hours and cost tens to hundreds of dollars of frontier inference.

Luna low writes the strategy, and a Jev-style pilot carries it out. Testing uses
Luna low for strategy, judging and summaries, and Sol 6.1 high for pregame
planning. Playing strength is still being measured. The goal is five-minute
games for under a dollar.

Pi configures your inference providers, and pi-magic uses those connections
for AI-driven play.

A work in progress.

## Quickstart

Clone the repo and review it with your favorite agent to get started. From the
checkout:

```
npm install
npm test
```

Inside Pi, load the extension from the checkout and play a game:

```
node node_modules/@earendil-works/pi-coding-agent/dist/cli.js -e ./index.ts
/magic play
```

Or install the package with `pi install npm:pi-magic`. It needs Pi 1.0 or newer.

`npm run matchup` plays two real Standard decks live through your Pi models.
`AGENTS.md` describes how the engine works and what is built.

## Game reports and timelines

`matchup`, `smoke` and `/magic play` save a `.result.json` and an interactive
`.timeline.html` beside the journal. Resuming a game writes a new report for that
run. The console prints their paths. Preparation failures also keep their bill.

The report groups calls by role, actual provider/model and thinking level. It
counts input, output, cached and reasoning tokens, cost, failed attempts,
cancellations and pending calls. Jev reviews and picks remain separate; judge
requests, cases, rulings and rollbacks remain separate.

Wall time includes preparation, play and finalization. Request time sums calls;
active time counts overlapping request intervals once. Strategy wait measures
time the pilot spent waiting for a plan. Input includes cached reads and writes;
reasoning is already included in output. Missing usage is unknown, not free.
Calls and waits cover this run; game counters include its retained journal
prefix. Neither clean counters nor matching replay certify legal or strong play.

Read saved results without making model calls:

```
npm run stats -- path/to/game.result.json
npm run stats -- --details path/to/game.result.json
npm run stats -- --json path/to/game.result.json
npm run timeline -- path/to/game.result.json
```

Open the HTML in a browser. Scroll to zoom, drag to pan, choose a turn, or click
a bar for its call details. Separate rows show concurrent requests within one
role, and the bottom chart shows total concurrency. Role buttons hide tracks.
The file needs no server or external assets and contains no prompts or replies.

New runs record turn starts directly. For older results, `timeline` reads the
saved calls trace and marks the first Jev request observed in each turn. Those
markers are labelled as observations rather than exact boundaries. Supply
`--trace path/to/game.calls.jsonl` if the trace moved. Older elapsed breakdowns
that were never measured remain unknown. JSON includes model and role totals,
call-purpose totals, and median and p95 request durations.
