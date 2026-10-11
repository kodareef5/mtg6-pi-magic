#!/usr/bin/env node
/**
 * One deck guide per list: how the deck is designed to be played, written once by the pregame model from the
 * list and its card text, kept under decks/guides and read by the pregame analysts of both seats. Advice for
 * the brief writers, not certified card meaning or a proven line.
 *
 *   node tools/guide.ts --deck "Izzet Spellementals" [--model gpt-6.1-sol:high] [--force]
 *   node tools/guide.ts --all        every web-sourced deck without a guide
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import { alpha, collection, deck as loadDeck, listed, type Deck } from "../src/core/decks.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { lookups } from "../src/context/brief.ts";
import { guidePath } from "../src/context/guides.ts";
import { reasoner } from "../src/context/reason.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { bill, tally } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { matchup, universe } from "./matchup-fixture.ts";

const { values } = parseArgs({ options: { deck: { type: "string", multiple: true }, all: { type: "boolean", default: false }, model: { type: "string" },
	force: { type: "boolean", default: false }, alpha: { type: "boolean", default: false }, out: { type: "string", default: ".pi/guides" } } });
const wanted = values.all ? [...collection().values()].filter((one) => /^https?:/.test(one.source)).map((one) => one.name) : values.deck ?? [];
if (!wanted.length) throw new Error("Name decks with --deck, or --all for every web-sourced deck.");

const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
const part = cast(rosterFor({ every: values.model ? { pregame: values.model } : {} }), { chat: await runtime.getAvailable(), classifiers: [] }).find((one) => one.role === "pregame")!;
if (!part.model) throw new Error(`No pregame model: ${part.problem ?? part.pattern}`);
const rules = loadRules(matchup.rules.path);
mkdirSync(values.out!, { recursive: true });
const trace = join(values.out!, `guides-${Date.now()}.calls.jsonl`);
const inference = traceInference({ classify: async () => { throw new Error("No classifier here"); },
	stream: (model, request, options) => runtime.streamSimple(model as never, request as never, options as never) as never }, (event) => appendFileSync(trace, JSON.stringify(event) + "\n"));

const SYSTEM = [
	"You write a deck guide for a Magic: The Gathering list in the Standard format: how the deck is designed to be played, for a strategist who will plan each turn of a game with it or against it.",
	"Read the list and the printed text given, and look up rules with the tools when a ruling matters. Say what the cards do together, not what each card says.",
	"Write these sections, each as short paragraphs or tight lists, about 900 to 1,400 words in all:",
	"1. Archetype and game plan: what the deck is trying to do, how fast, and how it wins.",
	"2. Engine and key interactions: the cards that make the deck work, the lines they form, and the exact sequencing those lines need, with the mana each step costs.",
	"3. The curve and sequencing by turn: a typical first five turns on the play and on the draw, which lands to lead, what to hold.",
	"4. Mulligans: what a keepable seven needs, what to ship.",
	"5. Combat and defense: when to attack into open boards and when to hold back, what blocks the deck can afford.",
	"6. Resources and timing: mana commitments, what to keep open and for which answers, the windows that matter.",
	"7. What beats it and how to adapt: the opposing plans and cards that punish the deck, and the adjustments that answer them.",
	"8. Common mistakes: the misplays a careful player avoids with this list.",
	"Name cards exactly as printed. Where a count matters, give the arithmetic. Do not invent cards or abilities. Submit the guide as markdown text with those eight numbered headings.",
	"Use sentence case headings, straight quotes and ordinary punctuation. Do not use em dashes. Name the card or player that acts.",
	"This guide is strategic advice. It does not certify card interpretations, rules legality or an executable line in a future position.",
].join("\n");

const list = (deck: Deck) => {
	const counts = new Map<string, number>();
	for (const name of listed(deck.main)) counts.set(name, (counts.get(name) ?? 0) + 1);
	const lines = [...counts].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0])).map(([name, n]) => {
		const card = universe.cards.get(name)!;
		return `${n} ${name} | ${card.mana || "no cost"} | ${card.type}${card.stats ? ` ${card.stats}` : ""} | ${card.oracle.replace(/\n/g, " ")}`;
	});
	const side = Object.entries(deck.sideboard).map(([name, n]) => `${n} ${name}`);
	return [`Deck: ${deck.name}`, `Source: ${deck.source}`, "", "Main deck, each distinct card once with its count, mana cost, type and printed text:", ...lines,
		...(side.length ? ["", "Sideboard:", ...side] : [])].join("\n");
};

const counted = tally();
for (const name of wanted) {
	const path = guidePath(name);
	if (existsSync(path) && !values.force) { console.log(`${name}: guide exists, skipped`); continue; }
	const deck = values.alpha ? alpha(loadDeck(name)) : loadDeck(name), began = Date.now();
	const writer = reasoner({ role: "pregame", stream: inference.stream, model: part.model as Model<Api>, tally: counted, ...(part.thinkingLevel ? { thinking: part.thinkingLevel } : {}) });
	let guide = "";
	try {
		const answer = await writer.work(`guide ${name}`, { system: SYSTEM, user: list(deck) }, {
			submit: { name: "submit", description: "Submit deck advice, not a certified card interpretation or executable turn plan.", parameters: { type: "object", properties: { guide: { type: "string", minLength: 400 } }, required: ["guide"], additionalProperties: false },
				check: (args) => typeof args.guide === "string" && /1\./.test(args.guide) && /8\./.test(args.guide) ? null : "guide is markdown text with the eight numbered sections." },
			lookups: lookups(universe, rules), turns: 3,
		}, 6000);
		guide = String(answer.guide);
	} catch (error) { console.log(`${name}: failed: ${String(error).slice(0, 200)}`); continue; }
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, [`# ${name}`, "", `Written ${new Date().toISOString().slice(0, 10)} by ${part.pattern} from the list at ${deck.source}, cards generated ${universe.generated}.${values.alpha ? " Sideboardless alpha: main deck only." : ""} Advice for the pregame; the board and card text win any disagreement.`, "", guide.trim(), ""].join("\n"));
	console.log(`${name}: ${guide.split(/\s+/).length} words in ${((Date.now() - began) / 1000).toFixed(0)}s -> ${path}`);
}
console.log(bill(counted.spent()).join("\n"));
process.exit(0);
