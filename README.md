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
