#!/usr/bin/env node
/**
 * The pool audit: every distinct card in the web-sourced decks assessed once with the pregame model, stored
 * when accepted, and otherwise written to the ledger with the model's reason and the decks it blocks. The
 * ledger is the list of concepts the engine cannot play yet, ordered by how many decks each one stops.
 *
 *   node tools/assess.ts [--deck NAME ...] [--model gpt-6.1-sol:high] [--jobs 4] [--retry]
 */
import { claudeCli } from "../src/context/claude-cli.ts";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import { alpha, collection } from "../src/core/decks.ts";
import { printedFacts } from "../src/core/printed.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { assessCard } from "../src/context/assess.ts";
import { reasoner } from "../src/context/reason.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { bill, tally } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { matchup, universe } from "./matchup-fixture.ts";
import { PACKAGE_SEED, ledgerPath, storedPackages, storePackage, writeRecord } from "../src/core/packages.ts";

const { values } = parseArgs({ options: { deck: { type: "string", multiple: true }, model: { type: "string" }, jobs: { type: "string", default: "4" },
	retry: { type: "boolean", default: false }, refresh: { type: "boolean", default: false }, report: { type: "boolean", default: false }, alpha: { type: "boolean", default: false }, card: { type: "string", multiple: true }, out: { type: "string", default: ".pi/assess" } } });
if (values.refresh && !values.card?.length) throw new Error("--refresh needs explicit --card names to reassess accepted meanings after review.");
const decks = (values.deck?.length ? values.deck.map((name) => collection().get(name) ?? (() => { throw new Error(`No deck ${name}`); })())
	: [...collection().values()].filter((one) => /^https?:/.test(one.source))).map((deck) => values.alpha ? alpha(deck) : deck);
type Ledger = Record<string, { reason: string; decks: string[]; model: string; at: string }>;
const ledgerFile = ledgerPath(universe.generated);
const ledger: Ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) as Ledger : {};
// This explicit maintenance command updates the shipped seed. Ordinary seating writes only to Pi's cache.
const store = { cache: PACKAGE_SEED };
const stored = storedPackages(universe, store);

// Setup registers the main deck and sideboard; both need source-backed equipment.
const byCard = new Map<string, string[]>();
for (const deck of decks) for (const card of Object.keys({ ...deck.main, ...deck.sideboard })) byCard.set(card, [...(byCard.get(card) ?? []), deck.name]);
const printed = printedFacts(universe, [...byCard.keys()]);
const todo = [...byCard.keys()].filter((card) => (!values.card?.length || values.card.includes(card)) && printed[card]?.text && (values.refresh || !stored.has(card)) && (values.refresh || values.retry || !ledger[card]));
console.log(`${byCard.size} distinct cards in ${decks.length}${values.alpha ? " sideboardless alpha" : ""} decks; ${stored.size} stored, ${Object.keys(ledger).length} on the ledger, ${todo.length} to assess.`);

const report = () => {
	for (const deck of decks) {
		const cards = Object.keys({ ...deck.main, ...deck.sideboard }).filter((card) => printed[card]?.text);
		const missing = cards.filter((card) => !stored.has(card));
		const deferred = cards.filter((card) => stored.get(card)?.package.deferred?.length);
		console.log(`${missing.length ? "BLOCKED" : "ASSESSED"} ${deck.name}: ${cards.length - missing.length}/${cards.length} standing assessments, ${deferred.length} cards with deferred uses${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
	}
	console.log("Assessment coverage does not establish executable uses, legal play or a completed game.");
};
if (values.report) { report(); process.exit(0); }
for (const card of values.card ?? []) if (!byCard.has(card)) throw new Error(`${card} is not in the selected decks.`);
const jobs = Number(values.jobs);
if (!Number.isInteger(jobs) || jobs < 1) throw new Error("--jobs must be a positive integer.");
if (!todo.length) { report(); process.exit(0); }
// An explicit reviewed refresh retires the previous meaning before inference. A
// refusal or interrupted call must not leave that known suspect package reusable.
if (values.refresh) {
	const backup = join(values.out!, `reviewed-packages-${Date.now()}`); mkdirSync(backup, { recursive: true });
	for (const card of todo) {
		const slug = card.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
		for (const [label, root] of [["seed", PACKAGE_SEED], ["cache", join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "magic", "packages")]]) {
			const path = join(root!, universe.generated, `${slug}.json`);
			if (existsSync(path)) { copyFileSync(path, join(backup, `${slug}-${label}.json`)); rmSync(path); }
		}
		const model = stored.get(card)?.model ?? "pending";
		stored.delete(card); ledger[card] = { reason: "Source review requested reassessment; no accepted replacement yet.", decks: byCard.get(card)!, model, at: new Date().toISOString().slice(0, 10) };
	}
	writeRecord(ledgerFile, Object.fromEntries(Object.entries(ledger).sort()));
}

const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
runtime.registerNativeProvider(claudeCli());
const part = cast(rosterFor({ every: values.model ? { pregame: values.model } : {} }), { chat: await runtime.getAvailable(), classifiers: [] }).find((one) => one.role === "pregame")!;
if (!part.model) throw new Error(`No pregame model: ${part.problem ?? part.pattern}`);
const rules = loadRules(matchup.rules.path);
mkdirSync(values.out!, { recursive: true });
const trace = join(values.out!, `assess-${Date.now()}.calls.jsonl`);
const inference = traceInference({ classify: async () => { throw new Error("No classifier here"); },
	stream: (model, request, options) => runtime.streamSimple(model as never, request as never, options as never) as never }, (event) => appendFileSync(trace, JSON.stringify(event) + "\n"));
const counted = tally();
let next = 0, ok = 0, bad = 0;
const save = () => writeRecord(ledgerFile, Object.fromEntries(Object.entries(ledger).sort()));
await Promise.all(Array.from({ length: jobs }, async () => {
	for (let card = todo[next++]; card; card = todo[next++]) {
		const writer = reasoner({ role: "pregame", stream: inference.stream, model: part.model as Model<Api>, tally: counted, ...(part.thinkingLevel ? { thinking: part.thinkingLevel } : {}), patience: 1000 });
		try {
			const pack = await assessCard(card, printed[card]!, writer, universe, rules, "standing");
			if (!storePackage(universe, pack, part.pattern, store)) throw new Error("Accepted assessment could not be saved; see the preparation-store notice.");
			// A reviewed correction must also replace an older live cache entry, which otherwise wins over the seed.
			storePackage(universe, pack, part.pattern);
			stored.set(card, storedPackages(universe, store).get(card)!); delete ledger[card]; ok++;
			console.log(`ok    ${card}`);
		} catch (error) {
			const reason = String(error instanceof Error ? error.message : error).replace(/^Error: /, "");
			ledger[card] = { reason, decks: byCard.get(card)!, model: part.pattern, at: new Date().toISOString().slice(0, 10) }; bad++;
			console.log(`FAIL  ${card}: ${reason.slice(0, 160)}`);
		}
		save();
	}
}));
mkdirSync(join(ledgerFile, ".."), { recursive: true }); save();
console.log(`\n${ok} assessed and stored, ${bad} on the ledger. Ledger: ${ledgerFile}`);
report();
console.log(bill(counted.spent()).join("\n"));
process.exit(0);
