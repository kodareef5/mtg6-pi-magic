#!/usr/bin/env node
// One real game against a real decision model. Opt in, never part of npm test.
//
// It costs money, so it is a script you run and not a test that runs itself.
// It reports the seed, the outcome, the model calls, the forced ratio and the
// gaps, which are the five numbers that say whether a change was worth it.
//
// Credentials are Pi's. This builds the same model runtime Pi uses, so a key
// already configured in Pi works here with nothing repeated, and TYPESAFE_API_KEY
// in the environment works too. No endpoint and no key is read in this repo.
import { parseArgs } from "node:util";

import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import { decisionApi } from "../src/context/model.ts";
import { startingIntent } from "../src/context/plan.ts";
import { cast, readRoster, rosterFor, type Crew } from "../src/context/roles.ts";
import { aiSeat } from "../src/context/seat.ts";
import { checkDeck, load as loadCards } from "../src/core/cards.ts";
import { start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import type { SeatId } from "../src/core/types.ts";

const { values: a } = parseArgs({
	options: {
		seed: { type: "string" },
		decide: { type: "string" },
		watch: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	},
});

if (a.help) {
	console.log(`usage: smoke.ts [--seed S] [--decide PATTERN] [--watch]

  --seed S            the game seed. Defaults to the clock, and is printed
  --decide PATTERN    the decision model, as a Pi model pattern. Defaults to
                      the roster's suggestion
  --watch             narrate every committed event as it happens

  One game of basic lands between two model-backed seats. It makes real calls
  and costs real money. A forced decision makes no call at all, so the cost is
  the model-call count below and not the decision count.`);
	process.exit(0);
}

const seed = a.seed ?? String(Date.now());
const runtime = await ModelRuntime.create();
const crew: Crew = a.decide ? { every: { decide: a.decide } } : {};
const parts = cast(rosterFor(crew), {
	chat: await runtime.getAvailable(),
	classifiers: await runtime.getAvailableOfType("classifier"),
});

console.log(readRoster(parts).join("\n"));

const decide = parts.find((part) => part.role === "decide");
if (!decide?.model || decide.model.type !== "classifier") {
	console.error(
		`\nNo decision model. ${decide?.problem ?? `${decide?.pattern} is not a classifier.`}\n` +
			`Configure the provider in Pi, or set TYPESAFE_API_KEY, then run again.`,
	);
	process.exit(1);
}

const cards = loadCards("cards/standard.tsv");
const decks = [Array(60).fill("Forest") as string[], Array(60).fill("Swamp") as string[]];
for (const deck of decks) {
	const problems = checkDeck(cards, deck, standard);
	if (problems.length) throw new Error(`Illegal deck: ${problems.join("; ")}`);
}

const table = start(standard, decks.map((deck) => ({ deck })), seed);
const api = decisionApi((model, request, options) => runtime.classify(model, request, options), decide.model);
let calls = 0;
const players: Record<SeatId, Player> = Object.fromEntries(
	table.seats.map((seat) => [
		seat.id,
		aiSeat({
			name: seat.name,
			api,
			intent: startingIntent(seat.id),
			onGap: (note) => void table.gaps.push(note),
			onAsk: () => void (calls += 1),
		}),
	]),
);

const began = Date.now();
const outcome = await play(table, players, {}, a.watch ? (line) => console.log(`  ${line}`) : undefined);
const by = (why: string) => table.ledger.filter((row) => row.why === why).length;
const forced = by("forced");

console.log(
	`\nseed      ${seed}` +
		`\noutcome   ${outcome ? JSON.stringify(outcome.results) : "unfinished, waiting on a usable answer"}` +
		`\nturns     ${table.cursor.turn}` +
		`\ndecisions ${table.ledger.length}  forced ${forced}  chosen ${by("chosen")}  fallback ${by("fallback")}` +
		`\nforced    ${((forced / Math.max(1, table.ledger.length)) * 100).toFixed(1)}%` +
		`\ncalls     ${calls} to ${api.named}` +
		`\ngaps      ${table.gaps.length}${table.gaps.length ? `\n  ${table.gaps.join("\n  ")}` : ""}` +
		`\nelapsed   ${((Date.now() - began) / 1000).toFixed(1)}s`,
);
process.exit(outcome && !table.gaps.length ? 0 : 1);
