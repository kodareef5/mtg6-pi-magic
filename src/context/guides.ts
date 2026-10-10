/**
 * Deck guides: one write-up per deck under decks/guides, how the list is designed to be played. Written once per
 * deck by the pregame model (tools/guide.ts) or by hand, and read by the pregame analysts for both seats' decks.
 * Advice, not facts: the board and the card text win any disagreement, as with every model-written section.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GUIDES = join(import.meta.dirname, "..", "..", "decks", "guides");
export const guideSlug = (deck: string) => deck.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const guidePath = (deck: string) => join(GUIDES, `${guideSlug(deck)}.md`);

/** The guide for a deck, or nothing when none has been written. */
export function guideFor(deck: string): string | undefined {
	const path = guidePath(deck);
	return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
}
