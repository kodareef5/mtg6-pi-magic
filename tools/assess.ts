#!/usr/bin/env node
/**
 * The pool audit: every distinct card in the web-sourced decks assessed once with the pregame model, stored
 * when accepted, and otherwise written to the ledger with the model's reason and the decks it blocks. The
 * ledger is the list of concepts the engine cannot play yet, ordered by how many decks each one stops.
 *
 *   node tools/assess.ts [--deck NAME ...] [--model gpt-6.1-sol:high] [--jobs 4] [--retry]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import { collection } from "../src/core/decks.ts";
import { printedFacts } from "../src/core/printed.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { assessCard } from "../src/context/assess.ts";
import { reasoner } from "../src/context/reason.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { bill, tally } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { matchup, universe } from "./matchup-fixture.ts";
import { ledgerPath, storedPackages, storePackage } from "./packages.ts";

const { values } = parseArgs({ options: { deck: { type: "string", multiple: true }, model: { type: "string" }, jobs: { type: "string", default: "4" },
	retry: { type: "boolean", default: false }, out: { type: "string", default: ".pi/assess" } } });
const decks = values.deck?.length ? values.deck.map((name) => collection().get(name) ?? (() => { throw new Error(`No deck ${name}`); })())
	: [...collection().values()].filter((one) => /^https?:/.test(one.source));
type Ledger = Record<string, { reason: string; decks: string[]; model: string; at: string }>;
const ledgerFile = ledgerPath(universe.generated);
const ledger: Ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, "utf8")) as Ledger : {};
const stored = storedPackages(universe.generated);

// Every distinct main-deck card with rules text, and the decks that play it.
const byCard = new Map<string, string[]>();
for (const deck of decks) for (const card of Object.keys(deck.main)) byCard.set(card, [...(byCard.get(card) ?? []), deck.name]);
const printed = printedFacts(universe, [...byCard.keys()]);
const todo = [...byCard.keys()].filter((card) => printed[card]?.text && !stored.has(card) && (values.retry || !ledger[card]));
console.log(`${byCard.size} distinct cards in ${decks.length} decks; ${stored.size} stored, ${Object.keys(ledger).length} on the ledger, ${todo.length} to assess.`);

const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
const part = cast(rosterFor({ every: values.model ? { pregame: values.model } : {} }), { chat: await runtime.getAvailable(), classifiers: [] }).find((one) => one.role === "pregame")!;
if (!part.model) throw new Error(`No pregame model: ${part.problem ?? part.pattern}`);
const rules = loadRules(matchup.rules.path);
mkdirSync(values.out!, { recursive: true });
const trace = join(values.out!, `assess-${Date.now()}.calls.jsonl`);
const inference = traceInference({ classify: async () => { throw new Error("No classifier here"); },
	stream: (model, request, options) => runtime.streamSimple(model as never, request as never, options as never) as never }, (event) => appendFileSync(trace, JSON.stringify(event) + "\n"));
const counted = tally();
let next = 0, ok = 0, bad = 0;
const save = () => writeFileSync(ledgerFile, JSON.stringify(Object.fromEntries(Object.entries(ledger).sort()), null, "\t") + "\n");
await Promise.all(Array.from({ length: Math.max(1, Number(values.jobs)) }, async () => {
	for (let card = todo[next++]; card; card = todo[next++]) {
		const writer = reasoner({ role: "pregame", stream: inference.stream, model: part.model as Model<Api>, tally: counted, ...(part.thinkingLevel ? { thinking: part.thinkingLevel } : {}), patience: 1000 });
		try {
			const pack = await assessCard(card, printed[card]!, writer, universe, rules, "standing");
			storePackage(universe.generated, pack, part.pattern); delete ledger[card]; ok++;
			console.log(`ok    ${card}`);
		} catch (error) {
			const reason = String(error instanceof Error ? error.message : error).replace(/^Error: /, "").slice(0, 600);
			ledger[card] = { reason, decks: byCard.get(card)!, model: part.pattern, at: new Date().toISOString().slice(0, 10) }; bad++;
			console.log(`FAIL  ${card}: ${reason.slice(0, 160)}`);
		}
		save();
	}
}));
mkdirSync(join(ledgerFile, ".."), { recursive: true }); save();
console.log(`\n${ok} assessed and stored, ${bad} on the ledger. Ledger: ${ledgerFile}`);
const blocked = new Map<string, string[]>();
for (const [card, entry] of Object.entries(ledger)) for (const deck of entry.decks) blocked.set(deck, [...(blocked.get(deck) ?? []), card]);
for (const deck of decks) { const cards = blocked.get(deck.name) ?? []; console.log(`${cards.length ? "BLOCKED" : "ready  "} ${deck.name}${cards.length ? `: ${cards.join(", ")}` : ""}`); }
console.log(bill(counted.spent()).join("\n"));
process.exit(0);
