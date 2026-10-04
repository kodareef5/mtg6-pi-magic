/** Real registered lists, pinned with their card and rules data. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { start } from "../src/core/commit.ts";
import { load, checkDeck } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";
import type { Procedure } from "../src/core/work-language.ts";

export const matchup = JSON.parse(readFileSync(new URL("../decks/standard-matchup.json", import.meta.url), "utf8")) as {
	event: string; eventDate: string; legalityDate: string;
	cards: { path: string; generated: string; sha256: string }; rules: { path: string; effective: string; sha256: string };
	decks: { name: string; pilot: string; source: string; main: Record<string, number>; sideboard: Record<string, number> }[];
};
export const universe = load(matchup.cards.path);
export const expand = (counts: Record<string, number>): string[] => Object.entries(counts).flatMap(([name, count]) => Array(count).fill(name));
for (const pin of [matchup.cards, matchup.rules]) {
	if (createHash("sha256").update(readFileSync(pin.path)).digest("hex") !== pin.sha256) throw new Error(`Pinned data changed: ${pin.path}`);
}
for (const deck of matchup.decks) {
	const main = expand(deck.main), sideboard = expand(deck.sideboard);
	const problems = [...checkDeck(universe, main, standard), ...checkDeck(universe, [...main, ...sideboard], standard)];
	if (main.length !== 60 || sideboard.length !== 15 || problems.length) throw new Error(`${deck.name}: ${problems.join("; ") || "expected 60 + 15 cards"}`);
}
export const matchTable = (seed: string) => start(standard, matchup.decks.map((deck, seat) => ({ name: seat ? "Red" : "Green", deck: expand(deck.main) })), seed);

const examples = readFileSync(new URL("../cards/examples.jsonl", import.meta.url), "utf8").trim().split("\n")
	.map((line) => JSON.parse(line) as { card: string; interpretations: { procedure: Procedure }[] });
const example = (card: string): Procedure => examples.find((line) => line.card === card)!.interpretations[0]!.procedure;
export const elf = example("Llanowar Elves");
export const shock = example("Shock");
