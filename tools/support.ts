#!/usr/bin/env node
/** Declare card support. Reports coverage, and with --write asks the strategy model
 * through Pi for support lines for cards that have none. Every line is checked
 * against the vocabulary before it is written; a card that cannot be expressed
 * exactly becomes a todo line naming what it needs.
 *
 *   npm run support                      coverage of the matchup decks
 *   npm run support -- --all             coverage of every Standard card
 *   npm run support -- --write [--all]   author missing lines live
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Check } from "typebox/value";
import { load } from "../src/core/cards.ts";
import { printedFacts } from "../src/core/printed.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { loadSupport } from "../src/core/support.ts";
import { InterpretationSchema, SupportSchema, type Support } from "../src/core/work-language.ts";
import { reasoner } from "../src/context/reason.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { bill, tally } from "../src/context/spend.ts";

const PATH = "cards/support.jsonl";
const { values } = parseArgs({ options: { all: { type: "boolean" }, write: { type: "boolean" }, batch: { type: "string", default: "6" }, limit: { type: "string" } } });
const universe = load("cards/standard.tsv");
const decks = JSON.parse(readFileSync("decks/standard-matchup.json", "utf8")) as { decks: { main: Record<string, number>; sideboard: Record<string, number> }[] };
const names = values.all ? [...universe.cards.keys()].sort() : [...new Set(decks.decks.flatMap((deck) => [...Object.keys(deck.main), ...Object.keys(deck.sideboard)]))].sort();
const printed = printedFacts(universe, names);

/** Short need phrases, so a report can count which machinery unlocks the most cards. */
const NEEDS = ["triggered ability", "static ability", "replacement effect", "counters", "keyword ability", "combat", "modes", "additional cost",
	"alternative cost", "X or computed amount", "library search", "token creation", "tapped or conditional entry", "sacrifice", "exile",
	"graveyard target", "other target kinds", "attachment", "continuous effect until end of turn", "type or characteristic change",
	"cost reduction", "play permission from another zone", "copy", "choice on resolution", "condition", "life gain or loss restriction", "prevention"];

const SYSTEM = [
	"Declare support for Magic: The Gathering cards in a table that never reads card text.",
	"Each supported card becomes ordinary actions: the table offers every interpretation whenever its timing, source, payment and targets allow, and a decision model picks among them without reading text.",
	"A game refuses to begin while any registered card lacks a supported line, so an honest todo line is worth more than an approximation.",
	"Return a JSON array with one line per requested card, either",
	"{card, status: \"supported\", interpretations: [{id, procedure}]} or {card, status: \"todo\", needs: [...], apology}.",
	"Write one interpretation per ability or permission: casting the card, playing it as a land, and each activated or mana ability. Ids are lowercase card-name-purpose, unique across all cards.",
	"Source is {zones, controller: \"self\", card: exact name}. Use zones [\"hand\"] for casting and land play, [\"battlefield\"] for a permanent's abilities. Never use refs.",
	"Timing spell casts the card: give spell.speed and spell.destination, and omit cost so the printed mana cost is paid. Timing land plays a land: no cost, target or instructions.",
	"Timing mana is a mana ability that only adds mana, such as {T}: Add {G} with cost {tap: true, generic: 0, colors: []}. Timing stack is any other activated ability and states its cost.",
	"Instruction amounts are literals: damage, mana, draw, choose-move and life. A permanent spell with nothing else to do on resolution has an empty instructions array.",
	"target is creature, player or creature-or-player. Planeswalker and battle targets are not offered; say so in basis when the card allows them.",
	"The table reads printed type, mana cost and power/toughness itself. Copy the card's text into basis.",
	"Mark a card todo if any of its rules text cannot be expressed exactly, including keywords and abilities that matter only later in the game. Reminder text in parentheses explains other text and needs nothing of its own.",
	`Name each need with one of these phrases when one fits, otherwise a short noun phrase: ${NEEDS.join("; ")}.`,
	"The apology is one plain sentence saying what part already fits and what is missing.",
	"What this does not promise: the table checks resources and timing, not that a line matches its card. A wrong line plays wrong in every game until it is corrected.",
	"Procedure schema:", JSON.stringify(InterpretationSchema),
	"Return the JSON array only, with no markdown.",
].join("\n");

function report(registry: ReturnType<typeof loadSupport>) {
	const textless = names.filter((name) => printed[name] && !printed[name].text);
	const lines = names.map((name) => registry.cards.get(name));
	const supported = lines.filter((line) => line?.status === "supported").length, todo = lines.filter((line) => line?.status === "todo");
	const missing = names.filter((name) => printed[name]?.text && !registry.cards.has(name));
	console.log(`${names.length} cards: ${textless.length} need no line, ${supported} supported, ${todo.length} todo, ${missing.length} with no line.`);
	console.log(`Playable: ${textless.length + supported} of ${names.length} (${(100 * (textless.length + supported) / names.length).toFixed(1)}%).`);
	const counts = new Map<string, number>();
	for (const line of todo) if (line?.status === "todo") for (const need of new Set(line.needs)) counts.set(need, (counts.get(need) ?? 0) + 1);
	for (const [need, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`  ${String(count).padStart(4)}  ${need}`);
	return missing;
}

function accept(raw: unknown, wanted: Set<string>, used: Set<string>): Support[] {
	if (!Array.isArray(raw)) throw new Error("Expected a JSON array of support lines.");
	return raw.map((entry: unknown) => {
		if (!Check(SupportSchema, entry)) throw new Error(`A line does not match the support schema: ${JSON.stringify(entry).slice(0, 200)}`);
		if (!wanted.has(entry.card)) throw new Error(`${entry.card} was not requested.`);
		if (entry.status === "supported") for (const { id, procedure } of entry.interpretations) {
			if (used.has(id)) throw new Error(`Interpretation id ${id} is already used.`);
			if (procedure.source.card !== entry.card || procedure.source.refs) throw new Error(`${entry.card}: select the card by name, without refs.`);
			checkProcedure(procedure);
		}
		return entry;
	});
}

let registry = loadSupport(PATH);
const missing = report(registry).slice(0, values.limit ? Number(values.limit) : undefined);
if (values.write && missing.length) {
	const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
	const runtime = await ModelRuntime.create();
	const parts = cast(rosterFor({ every: {} }), { chat: await runtime.getAvailable(), classifiers: await runtime.getAvailableOfType("classifier") });
	const strategy = parts.find((part) => part.role === "strategy");
	if (!strategy?.model || strategy.off) throw new Error(`No strategy model: ${strategy?.problem ?? strategy?.pattern}`);
	const counted = tally();
	const think = reasoner({ role: "strategy", stream: (model, context, options) => runtime.streamSimple(model, context as never, options as never) as never,
		model: strategy.model as never, tally: counted, ...(strategy.thinkingLevel ? { thinking: strategy.thinkingLevel } : {}) });
	const examples = [...registry.cards.values()].filter((line) => line.status === "supported" && line.example);
	const size = Number(values.batch);
	const batches = Array.from({ length: Math.ceil(missing.length / size) }, (_, at) => missing.slice(at * size, at * size + size));
	const written: Support[] = [];
	await Promise.all(batches.map(async (batch) => {
		const wanted = new Set(batch);
		let refused: string | undefined;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const user = JSON.stringify({ cards: batch.map((name) => { const card = universe.cards.get(name)!; return { name, type: card.type, mana: card.mana, stats: card.stats, oracle: card.oracle }; }),
					examples, ...(refused ? { refused } : {}) });
				const lines = accept(JSON.parse(await think.think("card support", { system: SYSTEM, user })), wanted,
					new Set([...registry.cards.values(), ...written].flatMap((line) => line.status === "supported" ? line.interpretations.map(({ id }) => id) : [])));
				const absent = batch.filter((name) => !lines.some((line) => line.card === name));
				if (absent.length) throw new Error(`No line for ${absent.join(", ")}.`);
				written.push(...lines);
				return;
			} catch (error) { refused = String(error); }
		}
		console.log(`Not written: ${batch.join(", ")}. ${refused}`);
	}));
	const merged = new Map(registry.cards);
	for (const line of written) merged.set(line.card, line);
	writeFileSync(PATH, [...merged.values()].sort((a, b) => a.card.localeCompare(b.card)).map((line) => JSON.stringify(line)).join("\n") + "\n");
	registry = loadSupport(PATH);
	console.log(`\nWrote ${written.length} lines. Review them: an accepted line is the meaning every game plays.\n`);
	report(registry);
	console.log(bill(counted.spent()).join("\n"));
}
