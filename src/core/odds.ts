/**
 * Draw odds, per viewer and per deck owner.
 *
 * Long for this repo, and it stays one file: the formulas and the limits on
 * reading them belong next to each other, because a number used wrongly is
 * worse than no number.
 *
 * Every figure is computed from one viewer's knowledge, never from the true
 * table. A calculator that reads the real library and reports a probability is
 * a leak wearing a number.
 */

import type { Knowledge } from "./knowledge.ts";
import type { Table } from "./table.ts";
import type { Frame, SeatId } from "./types.ts";

export type NameOdds = {
	/** Copies not accounted for outside the library, including an opponent's unknown hand. */
	remaining: number;
	/** Copies this viewer can name in that seat's current hand. */
	knownInHand: number;
	/** Chance that seat's next ordinary draw is this name. */
	draw: number;
	/** Chance that seat's current hand holds at least one copy. */
	inHand: number;
	/** The visibility and allocation assumptions behind the two numbers. */
	basis: string;
	/** The pool drawn from, and how many of its cards are an unknown hand. */
	pool: number;
	hand: number;
};

/**
 * The pool is the unresolved one, and choosing it wrongly is the usual mistake.
 *
 * For the viewer's own seat the pool is its library, because it identified
 * every card it drew. For another seat the pool is that seat's unknown hand and
 * library together, because a copy may already be in hand. Dividing four copies
 * by a 53 card library is wrong for exactly that reason.
 *
 * With no retained ordering, where N is the pool, K its copies of this name and
 * H the unknown hand size:
 *
 *   draw   = K / N
 *   inHand = 1 - C(N-K, H) / C(N, H)
 *
 * Four copies in an otherwise unknown 60 card deck with a seven card hand:
 * 6.67% next draw, 39.95% already held.
 *
 * Where a region covers the next library position, the draw chance splits into
 * the part the region accounts for and the part it does not:
 *
 *   draw = known copies in region / region slots
 *        + (1 - all known in region / region slots) * unassigned copies / unassigned cards
 *
 * The holding chance counts, per region, the allocations where no known copy
 * reaches the hand while tracking how many anonymous hand slots are left, then
 * applies the miss every copy calculation to the anonymous pool. Those
 * intermediate weights do not sum to one, and should not: the missing weight is
 * the allocations where a known copy is already in hand. A copy known to be in
 * hand makes inHand exactly one.
 */
export function odds(frame: Frame, owner: SeatId): Record<string, NameOdds> {
	/*
	 * The smallest honest scope, from this seat's view alone. Regions are not
	 * read yet: a scry, a card put on top, a reveal or a look leaves the pool
	 * uniform, and `basis` says so.
	 * 1. Start from the registered deck list for `owner`, by card name.
	 * 2. Subtract every copy this viewer can name outside that library.
	 * 3. The pool: our library, or another seat's unknown hand and library together.
	 * 4. The formulas above, with no region.
	 * 5. Absent beats guessed: no registered list, no numbers.
	 */
	const list = frame.view.decks?.find((deck) => deck.seat === owner)?.cards;
	const player = frame.view.players?.find((one) => one.id === owner);
	if (!list || player?.library === undefined || player.hand === undefined) return {};
	const mine = owner === frame.seat;
	const named = (frame.view.objects ?? []).filter((object) => object.owner === owner && object.card && object.zone !== "library");
	const inHand = (name: string) => named.filter((object) => object.zone === "hand" && object.card === name).length;
	const hidden = mine ? 0 : player.hand - named.filter((object) => object.zone === "hand").length;
	const pool = player.library + hidden;
	const left = Object.fromEntries(Object.entries(list).map(([name, copies]) => [name, Math.max(0, copies - named.filter((object) => object.card === name).length)]));
	const counted = Object.values(left).reduce((sum, copies) => sum + copies, 0);
	const basis = `${mine ? `your library of ${pool}` : `their ${hidden} unknown cards in hand and ${player.library} in library`}, from the registered list less every copy you can name; ` +
		`library order is not tracked, so a scry, a card put on top or a reveal is not counted` + (counted !== pool ? `; ${counted} unaccounted copies against a pool of ${pool}, so the list and the pool disagree` : "");
	return Object.fromEntries(Object.entries(left).map(([name, copies]) => [name, {
		remaining: copies, knownInHand: inHand(name),
		draw: pool ? copies / pool : 0,
		inHand: inHand(name) > 0 ? 1 : mine || !hidden ? 0 : 1 - choose(pool - copies, hidden) / choose(pool, hidden),
		basis, pool, hand: hidden,
	}]));
}

/** The chance at least one of these names comes within the next `draws` draws of `owner`'s pool, with no region: 1 - C(N-K, n) / C(N, n). */
export function within(found: Record<string, NameOdds>, names: string[], pool: number, draws: number): number {
	const copies = names.reduce((sum, name) => sum + (found[name]?.remaining ?? 0), 0);
	return pool ? 1 - choose(pool - copies, Math.min(draws, pool)) / choose(pool, Math.min(draws, pool)) : 0;
}

/**
 * What a mulligan is worth: the spread of hands this seat would draw instead.
 *
 * Sampled from the seat's belief about its own library, never from the real
 * one. A seat knows its own deck composition, so sampling that composition
 * reveals nothing and is honest. Reading the shuffled order would be cheating,
 * and that is the line.
 *
 * This is what turns "a credible draw path" from a feeling into a number. It
 * answers questions of the shape "at six cards, how often do I have two to
 * four lands and a play on turn two", which is the comparison a mulligan
 * decision actually needs. docs/MULLIGAN.md.
 *
 * 1. Build the multiset this seat believes is in its library.
 * 2. Deal `size` cards from it, many times, with the recorded random so a
 *    replay gets the same spread.
 * 3. Count how many samples satisfy each named condition and return the shares.
 * 4. Say how many samples it took, because a share without a sample count is
 *    not a number anybody can weigh.
 */
export function atSize(
	table: Table,
	knowledge: Knowledge,
	seat: SeatId,
	size: number,
	conditions: Record<string, (hand: string[]) => boolean>,
): { samples: number; share: Record<string, number> } {
	void [table, knowledge, seat, size, conditions];
	throw new Error("atSize is unwritten. Four steps above, and it samples belief.");
}

/**
 * How to read these numbers, and three ways to misread them.
 *
 * **They are marginals, one name at a time.** They do not answer "a counterspell
 * and the mana to cast it", or "a land and a threat within two draws". If one
 * Bolt and one Forest sit across a hand and a library, Bolt in hand and Bolt
 * next draw are each 50% and both at once is impossible. Multiplying marginals
 * gives a confident wrong answer. Summing next draw across distinct land names
 * is fine. Summing holding chances across names generally is not.
 *
 * **Uniform allocation is a prior, not hand reading.** A private reorder, a
 * bottomed card or a kept hand is treated as any arrangement being equally
 * likely. A mulligan, a scry, a tutor and a declined response all make some
 * arrangements far more plausible. Reading an opponent that way needs a
 * separate behavioural model, kept out of this file and out of the table.
 *
 * **Three different quantities stay apart.** A draw chance from this file, a
 * belief about what an opponent is holding, and a decision model's confidence
 * in its own answer are not the same number and never combine into one.
 */

const choose = (n: number, k: number): number => {
	if (k < 0 || k > n) return 0;
	let result = 1;
	for (let at = 1; at <= Math.min(k, n - k); at++) result = (result * (n - at + 1)) / at;
	return result;
};

/**
 * Every split of a draw across disjoint categories, with its chance: drawing
 * `draws` cards without replacement from a pool whose categories have these
 * counts. Exact, so overlapping events are added from these splits rather than
 * multiplied. For an opening hand the pool is the registered main deck before
 * anything is seen, which is why it needs no knowledge accounting.
 */
export function splits(categories: number[], draws: number): { counts: number[]; chance: number }[] {
	const total = categories.reduce((sum, count) => sum + count, 0), all = choose(total, draws);
	const found: { counts: number[]; chance: number }[] = [];
	const walk = (at: number, left: number, counts: number[], ways: number) => {
		if (at === categories.length - 1) {
			if (left <= categories[at]!) found.push({ counts: [...counts, left], chance: (ways * choose(categories[at]!, left)) / all });
			return;
		}
		for (let take = 0; take <= Math.min(left, categories[at]!); take++) walk(at + 1, left - take, [...counts, take], ways * choose(categories[at]!, take));
	};
	walk(0, draws, [], 1);
	return found;
}
