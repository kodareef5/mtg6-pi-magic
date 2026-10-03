/**
 * What each seat knows. Accounting only, no probability.
 *
 * Kept apart from odds.ts on purpose. The arithmetic of a draw chance is
 * straightforward and checkable by enumeration. Getting this file wrong is how
 * a previous build reported a 50% chance of a card being in a hand that an
 * earlier reveal had already ruled out. The bug was always here, never in the
 * maths.
 *
 * In a registered game every seat hands in a deck list, so deck composition is
 * public. What stays hidden is the arrangement: which card is where. That is
 * the whole reason expert odds are computable, and it is a property of the game
 * type rather than a fact about Magic. A casual table that registers nothing
 * leaves every opponent pool unknown and the odds absent rather than guessed.
 */

import type { ObjectId } from "./table.ts";
import type { SeatId } from "./types.ts";

/**
 * A set of identities whose arrangement is partly unresolved.
 *
 * It expresses things like: these two revealed cards now sit across one hand
 * slot and one library position, and I do not know which is where. That shape
 * is what lets knowledge survive a private reorder.
 */
export type Region = {
	/** Identities known to be in here, by card name with counts. */
	contents: Record<string, number>;
	/** Library positions this region may occupy. Empty when it is hand only. */
	positions: number[];
	/** Hidden hand slots tied into this region. */
	handSlots: number;
};

export type Knowledge = {
	viewer: SeatId;
	/** Identities this viewer can name outside any library. */
	identified: Map<ObjectId, string>;
	regions: Region[];
	/** Rises on every transition. A cached odds result carries it and is checked. */
	version: number;
};

/**
 * Regions are only meaningful while these hold, and nothing may save a set that
 * breaks them. A region that assumes its cards are interchangeable across its
 * slots can otherwise invent an arrangement that was never possible.
 *
 * 1. Positions are disjoint across regions.
 * 2. Memberships are disjoint: one identity belongs to one region.
 * 3. Capacity is sufficient: positions plus handSlots is at least the contents.
 * 4. Hand totals are consistent: the handSlots across regions do not exceed the
 *    hand.
 */
export function valid(regions: Region[], handSize: number): boolean {
	void [regions, handSize];
	throw new Error("valid is unwritten. Four invariants above, and nothing saves without them.");
}

/**
 * A shuffle destroys order. It does not destroy knowledge of contents.
 *
 * This is the rule the previous build got wrong, so it is stated as a function
 * rather than left to a caller: drop every position, keep every content count
 * and every hand slot. A region spanning a hand and a library survives a
 * library shuffle with its constraint intact, because the reveal that created
 * it still rules out what it ruled out.
 */
export function shuffled(knowledge: Knowledge, whose: SeatId): Knowledge {
	void [knowledge, whose];
	throw new Error("shuffled is unwritten: drop positions, keep contents and hand slots.");
}

/**
 * The transitions. Every one of them has to run, or the odds are confident and
 * wrong.
 *
 * - look: this viewer saw these identities privately. Others learn only that a
 *   look happened.
 * - reveal: everyone saw them. A different act from a look, with a different
 *   result for every other seat's knowledge.
 * - moved: an object changed zone. A public move keeps its identity known to
 *   all. A concealed move puts the identity into a region instead of dropping
 *   it.
 * - drew: the drawer identifies one card. For every other viewer the hand grew
 *   and the combined pool did not change, which is why an unobserved draw
 *   leaves their next draw odds alone and raises their holding odds.
 * - reordered: positions change inside a region, which is what a private scry
 *   or a tutor leaves behind.
 */
export function observe(
	knowledge: Knowledge,
	event: "look" | "reveal" | "moved" | "drew" | "reordered",
	about: unknown,
): Knowledge {
	void [knowledge, event, about];
	throw new Error("observe is unwritten. Five transitions above.");
}
