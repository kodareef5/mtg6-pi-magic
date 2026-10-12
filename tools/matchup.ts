#!/usr/bin/env node
/** Play the pinned Standard matchup live through Pi, from ordinary setup, unscripted.
 * Pregame assesses cards and writes briefs; strategy plans turns and Jev flies
 * the plan. --prepare saves version zero without playing. A run stops at an
 * outcome, the first gap, or --turns.
 */
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { dealtTable, matchTable, matchup, universe } from "./matchup-fixture.ts";
import { start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { open, save, replay, fork, reopen } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { judgeFor, seat as seatTable } from "../src/context/sit.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { traceInference } from "../src/context/trace.ts";
import { gameResult, report, preparationFailure, saveReport } from "./game-report.ts";
import { load as loadRules } from "../src/core/rules.ts";

const { values } = parseArgs({ options: { seed: { type: "string", default: "real-standard-9" }, out: { type: "string", default: ".pi/real-standard" },
	turns: { type: "string", default: "40" }, prepare: { type: "boolean", default: false }, resume: { type: "string" }, version: { type: "string" },
	/** Model patterns for a role this run only, such as gpt-6.1-sol:high. */
	pregame: { type: "string" }, strategy: { type: "string" },
	/** A strategy pattern for the seat playing that list alone, so one roster can face another. */
	green: { type: "string" }, red: { type: "string" },
	/** Two collection decks by name, comma separated, for a fresh game; the first named is on the play. */
	decks: { type: "string" }, alpha: { type: "boolean", default: false } } });
if (values.version && (!values.resume || !/^\d+$/.test(values.version))) throw new Error("--version needs a journal supplied by --resume and a nonnegative decision count.");
if (values.alpha && (!values.decks || values.resume)) throw new Error("--alpha needs --decks for a new sideboardless game. A resumed journal owns its registered lists.");
const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
const every = { summary: "off", ...(values.pregame ? { pregame: values.pregame } : {}), ...(values.strategy ? { strategy: values.strategy } : {}) };
const catalogue = { chat: await runtime.getAvailable(), classifiers: await runtime.getAvailableOfType("classifier") };
const parts = cast(rosterFor({ every }), catalogue);
const inference = { classify: (model: never, request: never, options: never) => runtime.classify(model, request, options),
	stream: (model: never, request: never, options: never) => runtime.streamSimple(model, request, options) as never };

const from = values.resume ? { path: values.resume, ...(values.version ? { version: Number(values.version) } : {}) } : undefined;
const carried = from && replay(from.path, dealtTable, from.version,
	{ cards: matchup.cards, rules: matchup.rules });
// Two collection decks by name. Seat names are short labels from the deck names; the first named deck is on the play.
const chosen = values.decks?.split(",").map((one) => one.trim());
if (chosen && (chosen.length !== 2 || chosen[0] === chosen[1] || from)) throw new Error("--decks names two different collection decks, comma separated, for a fresh game.");
const label = (name: string, at: number) => { const short = name.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 20); return short || `Seat${at}`; };
const table = carried ? carried.table : chosen ? start(standard, chosen.map((name, at) => ({ name: label(name, at), deck: values.alpha ? alpha(deck(name)) : deck(name) })), values.seed!, universe, { announcementsFrom: 0, excessManaFrom: 0 }) : matchTable(values.seed!, { announcementsFrom: 0, excessManaFrom: 0 });
if (chosen && table.seats[0]!.name === table.seats[1]!.name) throw new Error("The two deck names shorten to the same seat label; rename one deck.");
// A list's own strategy pattern, when --green or --red names one, resolved for whichever seat plays that list.
const byList: Record<string, string | undefined> = { Green: values.green, Red: values.red };
const partsFor = (seat: number) => {
	const pattern = byList[table.seats.find((one) => one.id === seat)?.name ?? ""];
	return pattern ? cast(rosterFor({ every, seats: { [String(seat)]: { strategy: pattern } } }, seat), catalogue) : parts;
};
for (const one of table.seats) for (const part of partsFor(one.id)) if (part.problem) throw new Error(`Seat ${one.id} ${part.role}: ${part.problem}`);
const id = `${table.rng.seed}-${Date.now()}`;
mkdirSync(values.out!, { recursive: true });
const path = join(values.out!, `${id}.jsonl`), calls = join(values.out!, `${id}.calls.jsonl`);
const journal = from ? reopen(path, fork(from.path, from.version ?? table.ledger.length, id, path), table)
	: open(path, { id, format: "standard", seed: table.rng.seed, announcementsFrom: table.announcementsFrom, excessManaFrom: table.excessManaFrom, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: matchup.cards, rules: matchup.rules, created: new Date().toISOString() });
writeFileSync(calls, "", { flag: "wx", mode: 0o600 });
const observed = traceInference(inference as never, (event) => {
	if (event.event === "request") save(journal, table);
	appendFileSync(calls, JSON.stringify(event) + "\n");
});
// The clock starts before seating, so the elapsed time includes the pregame.
const began = Date.now();
console.log(`${values.prepare ? "Preparing" : "Playing"} ${id}; journal ${path}`);
const seated = await seatTable(table, async (seat) => partsFor(seat), observed, universe, { format: "standard", reusePackages: !carried, journal, rules: loadRules(matchup.rules.path), ...(carried ? { prepared: carried.prepared } : {}) }).catch((error) => {
	const result = preparationFailure(table, error, began, { journal: path, trace: calls });
	const paths = saveReport(join(values.out!, `${id}.result.json`), result, table);
	console.error([...report(result), ...paths].join("\n"));
	process.exit(1);
});
const stop = new Error("Monitor stop");
const limit = Number(values.turns);
if (!values.prepare) seated.timing.playStartedAt = Date.now();
let failure: unknown;
try {
	if (!values.prepare) await play(table, seated.players, seated.intents, { watch: (line) => {
		console.log(line); save(journal, table);
		// This runner is a diagnostic gate: even a recoverable gap ends the run.
		if (table.gaps.length || table.cursor.turn > limit) throw stop;
	}, judge: judgeFor(table, seated, journal), onTurnStart: (turn, active) => seated.timing.turns!.push({ at: Date.now(), turn, active, source: "recorded" }) });
} catch (error) { if (error !== stop) failure = error; }
finally {
	if (!values.prepare) seated.timing.playEndedAt = Date.now();
	await Promise.all(Object.values(seated.players).map((player) => player.close()));
	save(journal, table);
}
// Replay returns at the next decision; reach that same boundary without answering it. A prepare-only run must too,
// or its health line reports a mismatch between an unadvanced table and an advanced replay of the same journal.
while (!table.outcome && !nextDecision(table)) advance(table);
// The game, not the run: an outcome's gaps are what live calls failed to do, which replay never makes.
const state = (game: typeof table) => JSON.stringify({ ledger: game.ledger, log: game.log, things: [...game.things], cursor: game.cursor, work: game.work, resolution: game.resolution, payment: game.payment, announcement: game.announcement, announcementsFrom: game.announcementsFrom, excessManaFrom: game.excessManaFrom, outcome: game.outcome?.results });
const replayMatches = state(replay(path, dealtTable).table) === state(table);
seated.timing.finishedAt = Date.now();
const result = gameResult(table, seated, { replayMatches, journal: path, trace: calls, ...(failure ? { error: String(failure) } : {}) });
const paths = saveReport(join(values.out!, `${id}.result.json`), result, table);
console.log([...report(result), ...paths].join("\n"));
process.exit(result.replayMatches && !table.gaps.length && !failure ? 0 : 1);
