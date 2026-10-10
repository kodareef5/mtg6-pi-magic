#!/usr/bin/env node
/**
 * The deck collection as a formal list of names. A deck is counts by card name, main and sideboard; every
 * name must be a card in the legal set, and a double-faced, split or adventure card goes by its full
 * `Front // Back` name. `check` validates every kept list without a game. `import` reads the plain text form
 * that meta sites publish ("4 Llanowar Elves", a blank line or "Sideboard" before the sideboard), resolves
 * front-face names, and writes a collection file only when the list registers.
 *
 *   node tools/decks.ts check [name ...]
 *   node tools/decks.ts import --name "Izzet Spellementals" --source URL (--file LIST.txt | --url TEXT_URL) [--slug izzet-spellementals]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { canonicalName, load } from "../src/core/cards.ts";
import { collection, problems, type Deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";

const COLLECTION = join(import.meta.dirname, "..", "decks", "collection");
const CARDS = join(import.meta.dirname, "..", "cards", "standard.tsv");
const universe = load(CARDS);

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
	name: { type: "string" }, source: { type: "string" }, file: { type: "string" }, url: { type: "string" }, slug: { type: "string" },
	force: { type: "boolean", default: false } } });
const verb = positionals[0];

/** One published line: a count, an optional x, a name, and nothing a list site adds after it. */
const LINE = /^\s*(\d+)\s*x?\s+(.+?)\s*(?:\([^)]*\)\s*\d*\s*)?$/;

/** Counts by canonical name, with every name the legal set does not have. */
function parseList(text: string): { main: Record<string, number>; sideboard: Record<string, number>; unknown: string[] } {
	const main: Record<string, number> = {}, sideboard: Record<string, number> = {}, unknown: string[] = [];
	let side = false, mainCount = 0;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) { if (mainCount >= 60) side = true; continue; }
		if (/^(sideboard|side)\b/i.test(line)) { side = true; continue; }
		if (/^(deck|main|mainboard|companion|commander)\b/i.test(line)) continue;
		const match = LINE.exec(line);
		if (!match) continue;
		const count = Number(match[1]), named = match[2]!;
		if (!side) mainCount += count;
		const full = canonicalName(universe, named);
		if (!full) { unknown.push(named); continue; }
		const into = side ? sideboard : main;
		into[full] = (into[full] ?? 0) + count;
	}
	return { main, sideboard, unknown };
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function report(deck: Deck): string[] {
	return problems(universe, deck, standard);
}

if (verb === "check") {
	const kept = collection();
	const names = positionals.slice(1).length ? positionals.slice(1) : [...kept.keys()];
	let wrong = 0;
	for (const name of names) {
		const deck = kept.get(name);
		if (!deck) { console.log(`${name}: not in the collection`); wrong++; continue; }
		const found = report(deck);
		const size = Object.values(deck.main).reduce((n, c) => n + c, 0), side = Object.values(deck.sideboard).reduce((n, c) => n + c, 0);
		console.log(`${found.length ? "FAIL" : "ok  "} ${name} (${size} + ${side})${found.length ? `: ${found.join("; ")}` : ""}`);
		if (found.length) wrong++;
	}
	console.log(`${names.length - wrong} of ${names.length} decks register for ${standard.name} against cards generated ${universe.generated}.`);
	process.exit(wrong ? 1 : 0);
} else if (verb === "import") {
	if (!values.name || !values.source || !(values.file || values.url)) throw new Error("import needs --name, --source and --file or --url.");
	const text = values.file ? readFileSync(values.file, "utf8") : await (await fetch(values.url!, { headers: { "user-agent": "pi-magic deck import" } })).text();
	const { main, sideboard, unknown } = parseList(text);
	const deck: Deck & { checked: string } = { name: values.name, source: values.source, main, sideboard, checked: universe.generated };
	const found = [...unknown.map((name) => `no card named ${name}`), ...report(deck)];
	const size = Object.values(main).reduce((n, c) => n + c, 0), side = Object.values(sideboard).reduce((n, c) => n + c, 0);
	console.log(`${values.name}: ${size} main, ${side} sideboard${found.length ? `\nFAIL: ${found.join("; ")}` : ""}`);
	if (found.length && !values.force) process.exit(1);
	const path = join(COLLECTION, `${values.slug ?? slugOf(values.name)}.json`);
	if (existsSync(path) && !values.force) throw new Error(`${path} exists; pass --force to replace it.`);
	writeFileSync(path, JSON.stringify(deck, null, "\t") + "\n");
	console.log(`Wrote ${path}`);
} else {
	console.log("usage: decks.ts check [name ...] | import --name N --source S (--file F | --url U) [--slug X] [--force]");
	process.exit(2);
}
