/** The pinned matchup: two real tournament lists from the deck collection, with their card and rules data. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { start } from "../src/core/commit.ts";
import { load } from "../src/core/cards.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";

export const matchup = JSON.parse(readFileSync(new URL("../decks/standard-matchup.json", import.meta.url), "utf8")) as {
	event: string; eventDate: string; legalityDate: string;
	cards: { path: string; generated: string; sha256: string }; rules: { path: string; effective: string; sha256: string };
	/** Names in decks/collection. */
	decks: string[];
};
export const universe = load(matchup.cards.path);
for (const pin of [matchup.cards, matchup.rules]) {
	if (createHash("sha256").update(readFileSync(pin.path)).digest("hex") !== pin.sha256) throw new Error(`Pinned data changed: ${pin.path}`);
}
export const decks = matchup.decks.map((name) => deck(name));
/** A game of the two lists. Setup registers both; an illegal list refuses the game. */
export const matchTable = (seed: string) => start(standard, decks.map((one, seat) => ({ name: seat ? "Red" : "Green", deck: one })), seed, universe);
/** The table a journal header dealt, whichever list sits first. Seat 0 is always on the play, so a fair sample seats each list first half the time. */
export const dealtTable = (header: { seed: string; seats: { name: string; deck: (typeof decks)[number] }[] }) =>
	start(standard, header.seats.map(({ name, deck }) => ({ name, deck })), header.seed, universe);
