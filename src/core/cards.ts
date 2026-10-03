/**
 * The card universe: what every card is called, costs, and says.
 *
 * `cards/standard.tsv` is in the repo: 5164 rows, every field checked against
 * Scryfall, one line each. It is dense, it is what a game needs, and it changes
 * when a set releases. `tools/cards.ts` rebuilds it and can write any format or
 * the whole 32,870 card universe. Nothing here downloads anything.
 *
 * Two things read it. Deck legality, which is the whole reason a format names a
 * column. And the syntax compiler, which needs the oracle text as its source.
 *
 * A file filtered to one format is that format's legality set by construction:
 * a card missing from it is not legal, and checkDeck says so by name.
 */

import { readFileSync } from "node:fs";

import type { Format } from "./format.ts";

export type Card = {
	name: string;
	mana: string;
	cmc: number;
	type: string;
	stats: string;
	oracle: string;
	/** Format column to its letter: L legal, B banned, R restricted, - not legal. */
	legal: Record<string, string>;
};

/**
 * `generated` is the date the file was built, read from its own header comment.
 * A journal pins it, because a set release changes oracle text and a replay
 * against different text is a different game.
 */
export type Universe = { path: string; generated: string; cards: Map<string, Card> };

/** Columns that are not a format. Everything else in the header is one. */
const FIXED = new Set([
	"name", "mana", "cmc", "type", "stats", "colors", "identity", "layout",
	"rarities", "keywords", "reserved", "gamechanger", "printings", "oracle",
	"oracle_id",
]);

export function load(path: string): Universe {
	const lines = readFileSync(path, "utf8").split("\n");
	const generated = lines.find((line) => line.startsWith("# Generated:"))?.match(/Generated: (\S+)/)?.[1] ?? "unknown";
	const rows = lines.filter((line) => line && !line.startsWith("#"));
	const header = rows.shift()?.split("\t");
	if (!header?.includes("oracle")) {
		throw new Error(`${path} has no column header. Run npm run cards to build it.`);
	}
	const at = (name: string) => header.indexOf(name);
	const formats = header.filter((column) => !FIXED.has(column));
	const cards = new Map<string, Card>();

	for (const row of rows) {
		const field = row.split("\t");
		const name = field[at("name")];
		if (!name) continue;
		cards.set(name, {
			name,
			mana: field[at("mana")] ?? "",
			cmc: Number(field[at("cmc")] ?? 0),
			type: field[at("type")] ?? "",
			stats: field[at("stats")] ?? "",
			// The generator escapes newlines so a card stays one row.
			oracle: (field[at("oracle")] ?? "").replaceAll("\\n", "\n"),
			legal: Object.fromEntries(formats.map((f) => [f, field[at(f)] ?? "-"])),
		});
	}
	return { path, generated, cards };
}

export function card(universe: Universe, name: string): Card {
	const found = universe.cards.get(name);
	if (!found) throw new Error(`No card named ${name} in ${universe.path}`);
	return found;
}

/**
 * Restricted counts as legal with one copy, which is what restricted means.
 * Banned and absent are both not legal, and a deck naming either is refused
 * with the reason rather than quietly played.
 */
export function copiesAllowed(universe: Universe, name: string, format: Format): number {
	const letter = card(universe, name).legal[format.legality] ?? "-";
	if (letter === "R") return 1;
	if (letter !== "L") return 0;
	if (card(universe, name).type.includes("Basic Land")) return Infinity;
	return format.singleton ? 1 : format.deck.maxCopies;
}

/** Every problem with a deck, named. An empty list means it may be played. */
export function checkDeck(universe: Universe, deck: string[], format: Format): string[] {
	const problems: string[] = [];
	if (deck.length < format.deck.minSize) {
		problems.push(`${deck.length} cards, ${format.name} wants at least ${format.deck.minSize}`);
	}
	const counts = new Map<string, number>();
	for (const name of deck) counts.set(name, (counts.get(name) ?? 0) + 1);

	for (const [name, count] of counts) {
		if (!universe.cards.has(name)) {
			problems.push(`no card named ${name}`);
			continue;
		}
		const allowed = copiesAllowed(universe, name, format);
		if (allowed === 0) problems.push(`${name} is not legal in ${format.name}`);
		else if (count > allowed) problems.push(`${count} copies of ${name}, ${allowed} allowed`);
	}
	return problems;
}
