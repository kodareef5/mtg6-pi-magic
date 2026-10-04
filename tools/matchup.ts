#!/usr/bin/env node
/** Play the pinned Standard matchup live through Pi, from ordinary setup, unscripted.
 * Each seat's strategy plans its turns and writes what its permanents register;
 * jev flies the plan. The run stops at an outcome, the first gap, or --turns.
 */
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { matchTable, matchup, universe } from "./matchup-fixture.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { open, save, replay, fork, reopen } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { judgeFor, seat as seatTable } from "../src/context/sit.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { traceInference } from "../src/context/trace.ts";
import { bill } from "../src/context/spend.ts";
import { load as loadRules } from "../src/core/rules.ts";

const { values } = parseArgs({ options: { seed: { type: "string", default: "real-standard-9" }, out: { type: "string", default: ".pi/real-standard" },
	turns: { type: "string", default: "40" }, resume: { type: "string" }, version: { type: "string" },
	/** Model patterns for a role this run only, such as gpt-6.1-sol:high. */
	pregame: { type: "string" }, strategy: { type: "string" } } });
if (values.version && (!values.resume || !/^\d+$/.test(values.version))) throw new Error("--version needs a journal supplied by --resume and a nonnegative decision count.");
const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
const parts = cast(rosterFor({ every: { summary: "off", ...(values.pregame ? { pregame: values.pregame } : {}), ...(values.strategy ? { strategy: values.strategy } : {}) } }), { chat: await runtime.getAvailable(), classifiers: await runtime.getAvailableOfType("classifier") });
const inference = { classify: (model: never, request: never, options: never) => runtime.classify(model, request, options),
	stream: (model: never, request: never, options: never) => runtime.streamSimple(model, request, options) as never };

const from = values.resume ? { path: values.resume, ...(values.version ? { version: Number(values.version) } : {}) } : undefined;
const carried = from && replay(from.path, (header) => matchTable(header.seed), from.version,
	{ cards: matchup.cards, rules: matchup.rules });
const table = carried ? carried.table : matchTable(values.seed!);
const id = `${table.rng.seed}-${Date.now()}`;
mkdirSync(values.out!, { recursive: true });
const path = join(values.out!, `${id}.jsonl`), calls = join(values.out!, `${id}.calls.jsonl`);
const journal = from ? reopen(path, fork(from.path, from.version ?? table.ledger.length, id, path), table)
	: open(path, { id, format: "standard", seed: table.rng.seed, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: matchup.cards, rules: matchup.rules, created: new Date().toISOString() });
writeFileSync(calls, "", { flag: "wx", mode: 0o600 });
const observed = traceInference(inference as never, (event) => {
	if (event.event === "request") save(journal, table);
	appendFileSync(calls, JSON.stringify(event) + "\n");
});
// The clock starts before seating, so the elapsed time includes the pregame.
const began = Date.now();
const seated = await seatTable(table, async () => parts, observed, universe, { format: "standard", journal, rules: loadRules(matchup.rules.path), ...(carried ? { prepared: carried.prepared } : {}) });
const stop = new Error("Monitor stop");
const limit = Number(values.turns);
try {
	await play(table, seated.players, seated.intents, (line) => {
		console.log(line); save(journal, table);
		// A strategy session that failed leaves the standing plan and play goes on; any other gap stops the run.
		if (table.gaps.some((gap) => !gap.endsWith("The standing plan is kept.")) || table.cursor.turn > limit) throw stop;
	}, undefined, undefined, judgeFor(table, seated, journal));
} catch (error) { if (error !== stop) throw error; }
finally { save(journal, table); }
// Replay returns at the next decision; reach that same boundary without answering it.
while (!table.outcome && !nextDecision(table)) advance(table);
const state = (game: typeof table) => JSON.stringify({ ledger: game.ledger, log: game.log, things: [...game.things], cursor: game.cursor, work: game.work, resolution: game.resolution, outcome: game.outcome });
const result = { seed: table.rng.seed, outcome: table.outcome, turn: table.cursor.turn, gaps: table.gaps,
	replayMatches: state(replay(path, (header) => matchTable(header.seed)).table) === state(table),
	reasons: Object.fromEntries(["forced", "delegated", "chosen", "declared", "fallback"].map((why) => [why, table.ledger.filter((row) => row.why === why).length])),
	calls: seated.tally.spent(), elapsedMs: Date.now() - began, journal: path, trace: calls };
writeFileSync(join(values.out!, `${id}.result.json`), JSON.stringify(result, null, 2) + "\n");
console.log(`${table.outcome ? "Finished" : "Stopped"} on turn ${table.cursor.turn}; replay ${result.replayMatches ? "matched" : "mismatch"}; ${table.gaps.length} gaps.`);
for (const gap of table.gaps) console.log(`Gap: ${gap}`);
console.log(bill(seated.tally.spent()).join("\n"));
process.exit(result.replayMatches && !table.gaps.length ? 0 : 1);
