/**
 * Before the first turn. Core, because every kind of seat has a pregame.
 *
 * Compiling the decks is not a favour to one kind of seat: the table cannot
 * offer a legal move without knowing what the cards do, whoever is sitting
 * there. The policy map is a slot, and the record it holds is in intent.ts.
 *
 * The mulligan is here too. docs/MULLIGAN.md is the plan, the rule text, and
 * the one place where we read 103.5 differently from its literal wording.
 */

import { firstMulliganFree, mulliganLimit } from "./format.ts";
import type { Policy } from "./intent.ts";
import { compile, type Change, type Compiled } from "./syntax.ts";
import { cardsIn, commit, type Table } from "./table.ts";
import type { Option, SeatId } from "./types.ts";

export type Prepared = {
	/** Compiled once per distinct card name, reused all game. */
	cards: Map<string, Compiled>;
	/** Empty for a seat that does not want one. */
	policies: Map<SeatId, Policy>;
	gaps: string[];
};

export function prepare(table: Table): Prepared {
	/*
	 * 1. Compile every distinct card name across every deck. One pass, cached,
	 *    because the same card in two decks is the same text.
	 * 2. Collect the gaps. A deck with an unstructured clause still plays: the
	 *    gap wakes when that clause would matter.
	 * 3. Leave the policy map empty. Whoever plays a seat fills it, or does not.
	 *
	 * Unwritten: it needs the compiler, which is milestone two. Milestone one
	 * plays basic lands, whose only ability the engine supplies itself.
	 */
	void [table, compile];
	throw new Error("prepare is unwritten. It needs syntax.compile, at milestone two.");
}

/** Deal the opening hands and open the first declaration round. */
export function begin(table: Table): void {
	const hands = table.seats.flatMap((s) =>
		cardsIn(table, "library", s.id)
			.slice(0, table.format.startingHand)
			.map((card) => ({ do: "move" as const, what: card.id, to: "hand" as const, reason: "draw" as const })),
	);
	commit(table, hands, "game-setup");
	table.opening = { declared: {}, taken: {}, kept: [], owed: {}, done: false };
}

/** How many cards this seat owes the bottom of its library, 103.5 and 103.5c. */
export function owedFor(table: Table, seat: SeatId): number {
	const taken = table.opening?.taken[seat] ?? 0;
	const free = firstMulliganFree(table.format, table.seats.length) ? 1 : 0;
	return Math.max(0, taken - free);
}

/**
 * The options at a declaration. 103.5, plus 103.5b.
 *
 * `keep` is first and always legal, so the list is never empty and a fallback
 * lands on the option that ends the process. `mulligan` is legal until the
 * opening hand would be zero cards. An opening-hand action a card permits is a
 * third kind of option and is unwritten: a seat holding Serum Powder is a gap.
 */
export function declareOptions(table: Table, seat: SeatId): Option[] {
	const options: Option[] = [{ id: "keep", label: "Keep this hand" }];
	const taken = table.opening?.taken[seat] ?? 0;
	if (taken < mulliganLimit(table.format, table.seats.length)) {
		const next = taken + 1 - (firstMulliganFree(table.format, table.seats.length) ? 1 : 0);
		options.push({
			id: "mulligan",
			label: `Mulligan`,
			shows: `a fresh ${table.format.startingHand}, then ${Math.max(0, next)} to the bottom if kept`,
		});
	}
	return options;
}

/**
 * Take every declared mulligan at once.
 *
 * 103.5 says all seats that declared take it at the same time, so this is one
 * committed group and not one per seat. Each shuffles its hand into its library
 * and draws a fresh starting hand.
 *
 * Bottoming happens here only under `per-mulligan`. Under `on-keep`, which is
 * the default and how every player does it, it waits for the keep.
 */
export function applyDeclared(table: Table): void {
	const opening = table.opening;
	if (!opening) throw new Error("applyDeclared with no opening round");

	const taking = table.seats.filter((s) => opening.declared[s.id] === "mulligan");
	const changes: Change[] = [];
	for (const s of taking) {
		for (const card of cardsIn(table, "hand", s.id)) {
			changes.push({ do: "move", what: card.id, to: "library", reason: "game-setup" });
		}
		changes.push({ do: "shuffle", whose: s.id });
	}
	for (const s of taking) {
		opening.taken[s.id] = (opening.taken[s.id] ?? 0) + 1;
	}
	if (changes.length) commit(table, changes, "game-setup");

	// Drawn after the shuffle, so the new hand comes off a shuffled library.
	const draws = taking.flatMap((s) =>
		cardsIn(table, "library", s.id)
			.slice(0, table.format.startingHand)
			.map((card) => ({ do: "move" as const, what: card.id, to: "hand" as const, reason: "draw" as const })),
	);
	if (draws.length) commit(table, draws, "game-setup");

	for (const s of taking) {
		if (table.format.mulliganBottom === "per-mulligan") opening.owed[s.id] = owedFor(table, s.id);
	}

	for (const s of table.seats) {
		if (opening.declared[s.id] === "keep") {
			opening.kept.push(s.id);
			if (table.format.mulliganBottom === "on-keep") {
				const owes = owedFor(table, s.id);
				if (owes > 0) opening.owed[s.id] = owes;
			}
		}
	}
	opening.declared = {};
	if (opening.kept.length === table.seats.length && Object.keys(opening.owed).length === 0) {
		opening.done = true;
	}
}

/**
 * The options for the next card to put on the bottom.
 *
 * One card at a time, because three from seven is 210 ordered choices and an
 * option list has to be readable. The order chosen is the order they are
 * placed, which matters only when something later reads the bottom of a
 * library, and the rules give the seat that choice so it is recorded.
 */
export function bottomOptions(table: Table, seat: SeatId): Option[] {
	const owes = table.opening?.owed[seat] ?? 0;
	return cardsIn(table, "hand", seat).map((card) => ({
		id: `bottom:${card.id}`,
		label: `Put ${card.card} on the bottom`,
		shows: owes > 1 ? `${owes} still to go` : "the last one",
	}));
}

/**
 * 103.6. Once the mulligans are done the starting player may take the actions
 * its opening hand allows, then each other seat in turn order.
 *
 * The options come from cards in hand that grant a pregame permission, which
 * needs card structure to detect. With no such card there is nothing to ask,
 * so this returns nothing and the game starts.
 */
export function openingOptions(table: Table, seat: SeatId): Option[] {
	void [table, seat];
	return [];
}
