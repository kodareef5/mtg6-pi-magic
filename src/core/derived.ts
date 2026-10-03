/**
 * Facts worked out from the table, per seat.
 *
 * Core, and available to every kind of seat. A person wants the mana curve as
 * much as a model does, and a remote agent wants the odds. None of this is
 * strategy: it says what is, not what to do.
 *
 * The rule that governs all of it: a derived fact is computed from what this
 * seat knows, never from the true table.
 *
 * Draw odds are the subtle case and they live in odds.ts, next to the knowledge
 * accounting they read.
 */

import type { Table } from "./table.ts";
import type { SeatId } from "./types.ts";

/** One readable block, same order every time, so two of them diff by eye. */
export function summary(table: Table, seat: SeatId): string[] {
	/*
	 * 1. Turn, phase, step, who holds priority.
	 * 2. Per seat: life, hand count, library count, graveyard count.
	 * 3. The battlefield, one permanent per line, with counters and damage.
	 * 4. The stack, top first, with each item's targets. Order is the whole
	 *    point of the stack, so it is never reordered for readability.
	 * 5. This seat's pool, one mana per line, with any spend condition, because
	 *    two green mana are not always interchangeable.
	 * 6. Standing notes this seat could know, with their lifetimes.
	 */
	void [table, seat];
	throw new Error("summary is unwritten. Six groups above.");
}

export type Curve = {
	/** Mana value to how many cards sit at it. */
	counts: Record<number, number>;
	/** Sources this seat can currently produce mana from, and how many. */
	available: number;
	/** Sources it could produce next turn if it plays a land. */
	nextTurn: number;
};

/**
 * The curve of what this seat can still draw, against what it can pay.
 *
 * Computed over the seat's own remaining library, which it is entitled to know
 * the contents of. For an opponent, the counts cover only cards this seat has
 * seen.
 */
export function manaCurve(table: Table, seat: SeatId): Curve {
	/*
	 * 1. Count the seat's remaining library by mana value, taken from compiled
	 *    cards rather than from text.
	 * 2. Count mana this seat can produce now: untapped sources, with each
	 *    source's own restrictions kept, not flattened to a number.
	 * 3. Add what one more land would produce, which is what makes the curve
	 *    answer "can I cast this next turn".
	 */
	void [table, seat];
	throw new Error("manaCurve is unwritten. Three steps above.");
}
