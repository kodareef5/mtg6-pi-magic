#!/usr/bin/env node
/** Monitor the first spell exchange from two pinned Standard lists and ordinary setup.
 * The run stops at the next unsupported line; it never reports a full-game result.
 */
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { matchTable, matchup, openingTools, universe } from "./matchup-fixture.ts";
import { cardsIn } from "../src/core/table.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { editWork } from "../src/core/work-tools.ts";
import { open, save, replay, fork, reopen } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { seat as seatTable, type Inference } from "../src/context/sit.ts";
import { cast, rosterFor, type Cast } from "../src/context/roles.ts";
import { traceInference } from "../src/context/trace.ts";
import { bill } from "../src/context/spend.ts";
import type { Packet } from "../src/context/packet.ts";

export async function runMatchup(inference: Inference, parts: Cast[], out: string, seed = "real-standard-9", authored = false, notify = console.log, from?: { path: string; version?: number }) {
	const carried = from && replay(from.path, (header) => matchTable(header.seed), from.version);
	const table = carried ? carried.table : matchTable(seed);
	seed = table.rng.seed;
	const id = `${seed}-${Date.now()}`;
	mkdirSync(out, { recursive: true });
	const path = join(out, `${id}.jsonl`), calls = join(out, `${id}.calls.jsonl`);
	const journal = from ? reopen(path, fork(from.path, from.version ?? table.ledger.length, id, path), table) : open(path, { id, format: "standard", seed, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: matchup.cards, rules: matchup.rules, created: new Date().toISOString() });
	writeFileSync(calls, "", { flag: "wx", mode: 0o600 });
	const observed = traceInference(inference, (event) => {
		if (event.event === "request") save(journal, table);
		appendFileSync(calls, JSON.stringify(event) + "\n");
		notify(`Call ${event.id}: ${event.kind} ${event.event}`);
	});
	if (!carried) for (const seat of table.seats) editWork(table, seat.id, [{ do: "plan.request", reason:
		`This monitored opening uses real full Standard lists. ${seat.id === 0 ? "On turn one, play Forest, make G, and cast Llanowar Elves as a 1/1 creature." : "On turn two, play Mountain, make R, and cast Shock targeting the opposing Llanowar Elves after it is on the battlefield."} ` +
		"Prepare exactly those three steps in your own precombat main, with one concept-only review to adopt the line once. Do not add pass steps or repeat the recipe. Use the supplied card facts. Delegate unique resolution instructions. Keep the dealt seven for this opening probe. Other cards and later combat remain outside this run; never replace their text with simpler effects." }], `opening-${seat.id}`);
	const seated = await seatTable(table, async () => parts, observed, universe, { format: "standard", journal, ...(carried ? { prepared: carried.prepared } : {}) });
	if (authored) for (const [seat, player] of Object.entries(seated.players)) {
		const answer = player.answer.bind(player);
		player.answer = async (frame) => frame.view.work?.request ? { kind: "work", tools: openingTools(frame), revision: frame.view.work.revision, actionId: `authored-${seat}` } : answer(frame);
	}
	const stop = new Error("Monitored opening checkpoint");
	let completed = false, stackVersion: number | undefined;
	const began = Date.now();
	try {
		await play(table, seated.players, seated.intents, (line) => {
			notify(line); save(journal, table);
			if (cardsIn(table, "stack").some((object) => object.card === "Shock")) stackVersion = table.ledger.length;
			completed = cardsIn(table, "graveyard", 0).some((object) => object.card === "Llanowar Elves") && cardsIn(table, "graveyard", 1).some((object) => object.card === "Shock");
			if (completed || table.cursor.turn > 2) throw stop;
		});
	} catch (error) { if (error !== stop) throw error; }
	finally { save(journal, table); }
	// Replay returns at the next decision. Reach that same boundary without
	// answering it; after a death this only grants the active player priority.
	while (!table.outcome && !nextDecision(table)) advance(table);
	const rebuilt = replay(path, (header) => matchTable(header.seed)).table;
	const state = (game: typeof table) => JSON.stringify({ ledger: game.ledger, log: game.log, things: [...game.things], cursor: game.cursor, work: game.work, resolution: game.resolution, outcome: game.outcome });
	const replayMatches = state(rebuilt) === state(table);
	if (stackVersion !== undefined) fork(path, stackVersion, `${id}-response`, join(out, `${id}-response.jsonl`));
	const next = "Stopped before further play: Hired Claw needs attack triggers and conditional activation; Sazh's Chocobo needs landfall and counters; Snakeskin Veil needs counters and temporary hexproof. Combat and nonbasic land procedures also remain unwritten.";
	const result = { seed, mode: authored ? "authored choices" : "Pi models", completed, replayMatches, turn: table.cursor.turn,
		spells: table.ledger.filter((row) => row.activation?.timing === "spell").length,
		gaps: table.gaps, stop: completed ? next : "The opening did not complete; inspect the saved decision and calls before continuing.",
		reasons: Object.fromEntries(["forced", "delegated", "chosen", "declared", "fallback"].map((why) => [why, table.ledger.filter((row) => row.why === why).length])),
		calls: seated.tally.spent(), elapsedMs: Date.now() - began, journal: path, trace: calls, stackVersion };
	writeFileSync(join(out, `${id}.result.json`), JSON.stringify(result, null, 2) + "\n");
	notify(`Opening ${completed ? "completed" : "incomplete"}; replay ${replayMatches ? "matched" : "mismatch"}; ${table.gaps.length} gaps. No game outcome declared.`);
	notify(result.stop);
	notify(bill(seated.tally.spent()).join("\n"));
	return { table, result };
}

/** Offline choices establish execution invariants; --live uses Pi for both seats. */
export function authoredInference(): Inference {
	return { stream() { throw new Error("This probe supplies authored preparation."); }, async classify(model, request) {
		const packet = request.state as unknown as Packet;
		return { api: model.api, provider: model.provider, model: model.id, timestamp: 0, stopReason: "stop", answers:
			Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
				if (question.type !== "choice") throw new Error("Expected a choice.");
				const ids = Object.keys(question.criteria);
				const choice = key.startsWith("concern-") ? packet.work?.draft ? "no-action" : ids.find((id) => id.startsWith("recipe:")) ?? "no-action" :
					ids.find((id) => id === "keep") ?? ids.find((id) => id === "work:execute") ?? ids.find((id) => id === "work:ready") ??
					ids.find((id) => id.startsWith("work:bind:") && !id.includes(":target:seat-")) ?? ids.find((id) => id.startsWith("work:adopt:")) ?? ids.find((id) => id.startsWith("work:dismiss:")) ?? ids[0]!;
				return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }];
			})) };
	} };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const { values } = parseArgs({ options: { live: { type: "boolean" }, seed: { type: "string", default: "real-standard-9" }, out: { type: "string", default: ".pi/real-standard" }, resume: { type: "string" }, version: { type: "string" } } });
	if (values.version && (!values.resume || !/^\d+$/.test(values.version))) throw new Error("--version needs a journal supplied by --resume and a nonnegative decision count.");
	let inference = authoredInference();
	let parts: Cast[] = [{ role: "decide", pattern: "authored", model: { type: "classifier", provider: "offline", api: "typesafe-system-one", id: "authored" } as never }, { role: "pregame", pattern: "off", off: true }];
	if (values.live) {
		const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
		const runtime = await ModelRuntime.create();
		parts = cast(rosterFor({ every: { pregame: "off", summary: "off" } }), { chat: await runtime.getAvailable(), classifiers: await runtime.getAvailableOfType("classifier") });
		inference = { classify: (model, request, options) => runtime.classify(model, request, options), stream: (model, request, options) => runtime.streamSimple(model, request as never, options as never) as never };
	}
	const { result } = await runMatchup(inference, parts, values.out!, values.seed!, !values.live, console.log,
		values.resume ? { path: values.resume, ...(values.version ? { version: Number(values.version) } : {}) } : undefined);
	process.exit(result.completed && result.replayMatches && !result.gaps.length ? 0 : 1);
}
