/** Assessment scope and order. Text length orders work; it never establishes support. */
import type { Universe } from "../src/core/cards.ts";
import type { Deck } from "../src/core/decks.ts";
import type { Package } from "../src/core/language.ts";
import { printedFacts } from "../src/core/printed.ts";

export function assessmentPool(universe: Universe, decks: Deck[], stored: Map<string, { package: Package }>,
	refusals: Record<string, { status?: "pending" | "unsupported" }>, options: { universe?: boolean; outsideImported?: boolean; complete?: boolean;
		cards?: string[]; retry?: boolean; refresh?: boolean; limit?: number } = {}) {
	if (options.outsideImported && !options.universe) throw new Error("--outside-imported requires --universe.");
	if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer.");
	const byCard = new Map<string, string[]>();
	for (const deck of decks) for (const card of Object.keys({ ...deck.main, ...deck.sideboard }))
		byCard.set(card, [...(byCard.get(card) ?? []), deck.name]);
	const names = options.universe ? [...universe.cards.keys()].filter(card => !options.outsideImported || !byCard.has(card)) : [...byCard.keys()];
	for (const card of options.cards ?? []) if (!names.includes(card)) throw new Error(`${card} is not in the selected assessment scope.`);
	const printed = printedFacts(universe, names);
	const pending = names.filter(card => (!options.cards?.length || options.cards.includes(card)) && printed[card]?.text &&
		(options.refresh || !stored.has(card) || (options.complete && !!stored.get(card)?.package.deferred?.length)) &&
		(options.refresh || options.retry || !refusals[card] || refusals[card].status === "pending"));
	if (options.universe) pending.sort((a, b) => printed[a]!.oracle.length - printed[b]!.oracle.length || a.localeCompare(b));
	return { names, byCard, printed, pending, todo: pending.slice(0, options.limit) };
}
