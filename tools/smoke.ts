#!/usr/bin/env node
// One real game against real models. Opt in, never part of npm test.
//
// It costs money, so it is a script you run and not a test that runs itself. It
// reports the seed, the outcome, the decision-model calls, the forced ratio, the
// token bill by role and the gaps, which are the numbers that say whether a
// change was worth it.
//
// Credentials are Pi's. This builds the same model runtime Pi uses, so a key
// already configured in Pi works here with nothing repeated. No endpoint and no
// key is read in this repo.
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import { cast, readRoster, rosterFor, type Crew, type Role } from "../src/context/roles.ts";
import { degraded, report, run, seat as seatTable } from "../src/context/sit.ts";
import { checkDeck, load as loadCards } from "../src/core/cards.ts";
import { open, reopen, replay, type Header } from "../src/core/journal.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";

const { values: a } = parseArgs({
	options: {
		seed: { type: "string" },
		decide: { type: "string" },
		pregame: { type: "string" },
		summary: { type: "string" },
		"open-lists": { type: "boolean" },
		from: { type: "string" },
		out: { type: "string", short: "o", default: "games" },
		"no-brief": { type: "boolean" },
		watch: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	},
});

if (a.help) {
	console.log(`usage: smoke.ts [--seed S] [--decide P] [--pregame P] [--summary P]
                [--open-lists] [--no-brief] [--watch]

  --seed S        the game seed. Defaults to the clock, and is printed
  --decide P      the decision model, as a Pi model pattern
  --pregame P     the reasoner that writes the brief
  --summary P     the commentator. --summary off skips every recap, which is
                  how to price it against playing with no commentary
  --open-lists    each seat's pregame sees the other decks. Benchmarks only
  --from F        continue games/F.jsonl, which carries everything it held:
                  its briefs, its decisions and its position. Clone a finished
                  game at version 0 to get one with the pregame already paid for
  -o DIR          where the journal lands. Defaults to games/
  --no-brief      skip the pregame pass, to price it against playing without one
  --watch         narrate every committed event and recap as it happens

  One game of basic lands between two model-backed seats. It makes real calls
  and costs real money. A forced decision makes no call at all, so the cost is
  the call counts below and not the decision count.`);
	process.exit(0);
}

const seed = a.seed ?? String(Date.now());
const runtime = await ModelRuntime.create();
const every: Crew["every"] = {};
for (const role of ["decide", "pregame", "summary"] as Role[]) {
	const asked = a[role as "decide" | "pregame" | "summary"];
	if (asked) every[role] = asked;
}
const catalogue = {
	chat: await runtime.getAvailable(),
	classifiers: await runtime.getAvailableOfType("classifier"),
};
const parts = cast(rosterFor({ every }), catalogue);
console.log(readRoster(parts).join("\n"));

const cards = loadCards("cards/standard.tsv");
const decks = [Array(60).fill("Forest") as string[], Array(60).fill("Swamp") as string[]];
for (const deck of decks) {
	const problems = checkDeck(cards, deck, standard);
	if (problems.length) throw new Error(`Illegal deck: ${problems.join("; ")}`);
}

const inference = {
	classify: (model: never, request: never, options: never) => runtime.classify(model, request, options),
	stream: (model: never, context: never, options: never) => runtime.streamSimple(model, context, options),
} as never;

const rules = loadRules("rules/cr.tsv");
const dealt = (saved: Header) =>
	start(standard, saved.seats.map((at) => ({ name: at.name, deck: at.deck })), saved.seed);

// --from continues that game. It is the same game, so everything it held comes
// with it and nothing has to be matched up afterwards.
const carried = a.from
	? replay(join(a.out!, `${a.from}.jsonl`), dealt, undefined, { cards, rules })
	: null;
const table = carried?.table ?? start(standard, decks.map((deck) => ({ deck })), seed);
const journal = carried
	? reopen(join(a.out!, `${a.from}.jsonl`), carried.header, carried.table)
	: open(join(a.out!, `${seed}.jsonl`), {
			id: seed,
			format: standard.name,
			seed,
			seats: table.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck })),
			cards: { path: cards.path, generated: cards.generated },
			rules: { path: "rules/cr.tsv", effective: rules.effective },
			created: new Date().toISOString(),
		});

if (journal.repaired) console.log(`repaired  dropped a torn last line: ${journal.repaired.slice(0, 80)}`);

const began = Date.now();
const seated = await seatTable(
	table,
	// --no-brief drops the pregame role rather than faking an empty brief, so the
	// run reads as a game played without one.
	async (at) => cast(rosterFor({ every }, at), catalogue).filter((part) => !(a["no-brief"] && part.role === "pregame")),
	inference,
	cards,
	{
		format: standard.name,
		journal,
		rules,
		...(a["open-lists"] ? { openLists: true } : {}),
		...(carried?.prepared.length ? { prepared: carried.prepared } : {}),
	},
);

const commentator = parts.find((part) => part.role === "summary");
const outcome = await run(
	table,
	seated,
	inference,
	commentator,
	a.watch ? (line) => console.log(`  ${line}`) : undefined,
	journal,
);

console.log(`\nseed      ${seed}\n${report(table, seated, outcome, Date.now() - began).join("\n")}`);
console.log(`journal   ${journal.path}`);
console.log(`clone     node tools/smoke.ts --from ${seed}   (continues this game)`);
// Non-zero when the result is not comparable: a game that finished with half its
// briefs missing finished, and a benchmark that counted it as clean is lying.
process.exit(outcome && !degraded(table, seated) ? 0 : 1);
