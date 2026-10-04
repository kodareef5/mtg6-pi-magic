/**
 * A deck: a name, where the list came from, and its main deck and sideboard as
 * counts of card names. A name identifies one card in the card universe, so a
 * deck is nothing but references into it.
 *
 * Setup registers each seat's deck for its game. Registration is where the
 * format is enforced: every card exists in the universe, is legal there, is
 * supported, and the counts follow the format (100.2a, 100.4a). A game whose
 * deck does not register does not begin, and every card in a game comes from a
 * registered deck.
 *
 * `decks/collection/` keeps decks handy for tests and play, one file each.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkDeck, copiesAllowed, unsupported, type Universe } from "./cards.ts";
import type { Format } from "./format.ts";

export type Deck = { name: string; source: string; main: Record<string, number>; sideboard: Record<string, number> };

/** The card names a list of counts holds, in the order the list gives them. */
export const listed = (counts: Record<string, number>): string[] => Object.entries(counts).flatMap(([name, count]) => Array<string>(count).fill(name));

/** Every reason this deck cannot be registered for this format. Empty means it can. */
export function problems(universe: Universe, deck: Deck, format: Format, blocked = unsupported()): string[] {
	const found = checkDeck(universe, listed(deck.main), format, blocked);
	const side = listed(deck.sideboard);
	if (side.length > format.deck.maxSideboard) found.push(`${side.length} sideboard cards, ${format.name} allows ${format.deck.maxSideboard}`);
	for (const [name, count] of Object.entries(deck.sideboard)) {
		if (!universe.cards.has(name)) { found.push(`no card named ${name} in the sideboard`); continue; }
		if (blocked.has(name)) found.push(`${name} is not supported yet`);
		const total = count + (deck.main[name] ?? 0), allowed = copiesAllowed(universe, name, format);
		if (allowed === 0) found.push(`${name} is not legal in ${format.name}`);
		else if (total > allowed) found.push(`${total} copies of ${name} across deck and sideboard, ${allowed} allowed`);
	}
	return [...new Set(found)];
}

/** Register a deck for a game, or say why it cannot be. */
export function register(universe: Universe, deck: Deck, format: Format): Deck {
	const wrong = problems(universe, deck, format);
	if (wrong.length) throw new Error(`${deck.name} cannot be registered for ${format.name}: ${wrong.join("; ")}.`);
	return structuredClone(deck);
}

const COLLECTION = join(import.meta.dirname, "..", "..", "decks", "collection");
const counts = (value: unknown) => !!value && typeof value === "object" && Object.values(value).every((count) => Number.isInteger(count) && (count as number) > 0);
/** One deck file. Its shape is checked here; its cards are checked when it is registered. */
export function loadDeck(path: string): Deck {
	const value = JSON.parse(readFileSync(path, "utf8")) as Partial<Deck>;
	if (typeof value.name !== "string" || typeof value.source !== "string" || !counts(value.main) || !counts(value.sideboard ?? {})) throw new Error(`${path} is not a deck: it needs a name, a source, and counts.`);
	return { name: value.name, source: value.source, main: value.main!, sideboard: value.sideboard ?? {} };
}

/** The decks kept for tests and play, by name. */
export function collection(directory = COLLECTION): Map<string, Deck> {
	return new Map(readdirSync(directory).filter((file) => file.endsWith(".json")).sort().map((file) => { const deck = loadDeck(join(directory, file)); return [deck.name, deck]; }));
}

let kept: Map<string, Deck> | undefined;
/** One deck from the collection, by name. */
export function deck(name: string): Deck {
	const found = (kept ??= collection()).get(name);
	if (!found) throw new Error(`No deck named ${name} in decks/collection. Kept: ${[...kept.keys()].join(", ")}.`);
	return structuredClone(found);
}
