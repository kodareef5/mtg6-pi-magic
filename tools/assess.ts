#!/usr/bin/env node
/**
 * Assess imported decks or a bounded batch from the pinned Standard pool using the selected pregame model.
 * Complete preparation checks all uses now. Refusals name claimed missing operations, not proven engine gaps.
 *
 *   node tools/assess.ts [--deck NAME ...] [--model gpt-6.1-sol:high] [--jobs 4] [--retry]
 *   node tools/assess.ts --universe --outside-imported --complete --limit 100 --jobs 4
 */
import { claudeCli } from "../src/context/claude-cli.ts";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import { alpha, collection } from "../src/core/decks.ts";
import type { Package } from "../src/core/language.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { assessCard, UnsupportedAssessment } from "../src/context/assess.ts";
import { reasoner } from "../src/context/reason.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { bill, tally } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { matchup, universe } from "./matchup-fixture.ts";
import { PACKAGE_SEED, ledgerPath, storedPackages, storePackage, writeRecord } from "../src/core/packages.ts";
import { assessmentPool } from "./assessment-pool.ts";

const { values } = parseArgs({ options: { deck: { type: "string", multiple: true }, model: { type: "string" }, jobs: { type: "string", default: "4" },
	universe: { type: "boolean", default: false }, "outside-imported": { type: "boolean", default: false }, complete: { type: "boolean", default: false }, limit: { type: "string" },
	retry: { type: "boolean", default: false }, refresh: { type: "boolean", default: false }, report: { type: "boolean", default: false }, alpha: { type: "boolean", default: false }, card: { type: "string", multiple: true }, out: { type: "string", default: ".pi/assess" } } });
if (values.refresh && !values.card?.length) throw new Error("--refresh needs explicit --card names to reassess accepted meanings after review.");
if (values.universe && (values.deck?.length || values.alpha)) throw new Error("--universe cannot combine with --deck or --alpha.");
const decks = (values.deck?.length ? values.deck.map((name) => collection().get(name) ?? (() => { throw new Error(`No deck ${name}`); })())
	: [...collection().values()].filter((one) => /^https?:/.test(one.source))).map((deck) => values.alpha ? alpha(deck) : deck);
type Ledger = Record<string, { reason: string; decks: string[]; model: string; at: string; status?: "pending" | "unsupported" }>;
const ledgerFile = ledgerPath(universe.generated);
const ledger: Ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) as Ledger : {};
// This explicit maintenance command updates the shipped seed. Ordinary seating writes only to Pi's cache.
const store = { cache: PACKAGE_SEED };
const stored: Map<string, { package: Package; model?: string }> = storedPackages(universe, store);

const { names, byCard, printed, pending, todo } = assessmentPool(universe, decks, stored, ledger, {
	universe: values.universe, outsideImported: values["outside-imported"], complete: values.complete, cards: values.card,
	refresh: values.refresh, retry: values.retry, ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
});
console.log(`${names.length} distinct cards in scope; ${stored.size} stored, ${Object.keys(ledger).length} on the ledger; ${pending.length} pending, ${todo.length} in this ${values.complete ? "complete" : "standing"} batch.`);

const report = () => {
	if (values.universe) {
		console.log(JSON.stringify({ sharedPrinted: names.filter(card => !printed[card]?.text).length,
			complete: names.filter(card => stored.has(card) && !stored.get(card)!.package.deferred?.length).length,
			deferred: names.filter(card => stored.get(card)?.package.deferred?.length).length, selected: todo }, null, 2));
		console.log("Complete preparation is source-checked structured meaning, not verified play."); return;
	}
	for (const deck of decks) {
		const cards = Object.keys({ ...deck.main, ...deck.sideboard }).filter((card) => printed[card]?.text);
		const missing = cards.filter((card) => !stored.has(card));
		const deferred = cards.filter((card) => stored.get(card)?.package.deferred?.length);
		console.log(`${missing.length ? "BLOCKED" : "ASSESSED"} ${deck.name}: ${cards.length - missing.length}/${cards.length} standing assessments, ${deferred.length} cards with deferred uses${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
	}
	console.log("Assessment coverage does not establish executable uses, legal play or a completed game.");
};
if (values.report) { report(); process.exit(0); }
const jobs = Number(values.jobs);
if (!Number.isInteger(jobs) || jobs < 1) throw new Error("--jobs must be a positive integer.");
if (!todo.length) { report(); process.exit(0); }
const previous = new Map(values.universe && values.refresh ? todo.flatMap(card => stored.has(card) ? [[card, stored.get(card)!.package] as const] : []) : []);
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
		stored.delete(card); ledger[card] = { status: "pending", reason: "Source review requested reassessment; no accepted replacement yet.", decks: byCard.get(card) ?? [], model, at: new Date().toISOString().slice(0, 10) };
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
const run = join(values.out!, `assess-${Date.now()}`), trace = `${run}.calls.jsonl`;
writeRecord(`${run}.json`, { cards: todo, preparation: values.complete ? "complete" : "standing", model: part.pattern,
	generated: universe.generated, source: { cards: matchup.cards, rules: matchup.rules }, jobs, sourceReview: values.universe });
const inference = traceInference({ classify: async () => { throw new Error("No classifier here"); },
	stream: (model, request, options) => runtime.streamSimple(model as never, request as never, options as never) as never }, (event) => appendFileSync(trace, JSON.stringify(event) + "\n"));
const counted = tally();
let next = 0, ok = 0, bad = 0, errors = 0, stopped = false;
const save = () => writeRecord(ledgerFile, Object.fromEntries(Object.entries(ledger).sort()));
await Promise.all(Array.from({ length: jobs }, async () => {
	const writer = reasoner({ role: "pregame", stream: inference.stream, model: part.model as Model<Api>, tally: counted, ...(part.thinkingLevel ? { thinking: part.thinkingLevel } : {}) });
	for (let card = todo[next++]; card && !stopped; card = todo[next++]) {
		let result: { card: string; status: string; reason?: string };
		try {
			const prior = previous.get(card);
			if (prior) appendFileSync(`${run}.drafts.jsonl`, JSON.stringify(prior) + "\n");
			let pack = await assessCard(card, printed[card]!, writer, universe, rules, values.complete ? "complete" : "standing", prior);
			if (values.universe && !prior) {
				appendFileSync(`${run}.drafts.jsonl`, JSON.stringify(pack) + "\n");
				pack = await assessCard(card, printed[card]!, writer, universe, rules, values.complete ? "complete" : "standing", pack);
			}
			if (!storePackage(universe, pack, part.pattern, store)) throw new Error("Accepted assessment could not be saved; see the preparation-store notice.");
			// A reviewed correction must also replace an older live cache entry, which otherwise wins over the seed.
			storePackage(universe, pack, part.pattern);
			stored.set(card, { package: pack, model: part.pattern }); delete ledger[card]; ok++;
			result = { card, status: "accepted" };
			console.log(`ok    ${card}`);
		} catch (error) {
			const reason = String(error instanceof Error ? error.message : error).replace(/^Error: /, "");
			if (error instanceof UnsupportedAssessment) {
				ledger[card] = { status: "unsupported", reason, decks: byCard.get(card) ?? [], model: part.pattern, at: new Date().toISOString().slice(0, 10) }; bad++;
				result = { card, status: "refused", reason };
			} else { errors++; result = { card, status: "error", reason }; }
			if (writer.broken()) stopped = true;
			console.log(`${result.status.toUpperCase()}  ${card}: ${reason.slice(0, 160)}`);
		}
		save();
		appendFileSync(`${run}.results.jsonl`, JSON.stringify(result) + "\n");
		writeRecord(`${run}.spend.json`, counted.spent());
	}
}));
mkdirSync(join(ledgerFile, ".."), { recursive: true }); save();
console.log(`\n${ok} assessed and stored, ${bad} refused, ${errors} unfinished errors${stopped ? "; stopped after provider failure" : ""}. Ledger: ${ledgerFile}`);
report();
console.log(bill(counted.spent()).join("\n"));
process.exit(errors || stopped ? 1 : 0);
