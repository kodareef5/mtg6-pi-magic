/**
 * Before the first turn. Core, because every kind of seat has a pregame.
 *
 * Past 150 lines because its round procedure and choices share the same state.
 * The mulligan is here too. docs/MULLIGAN.md is the plan, the rule text, and
 * the one place where we read 103.5 differently from its literal wording.
 */

import { firstMulliganFree, mulliganLimit } from "./format.ts";
import type { Pending } from "./moves.ts";
import type { Change, Reason } from "./syntax.ts";
import { commit } from "./commit.ts";
import { cardsIn, type Table } from "./table.ts";
import type { Option, SeatId } from "./types.ts";

/** Deal the opening hands and open the first declaration round. */
export function begin(table: Table): void {
	const hands = table.seats.flatMap((s) =>
		cardsIn(table, "library", s.id)
			.slice(0, table.format.startingHand)
			.map((card) => ({ do: "move" as const, what: card.id, to: "hand" as const, reason: "draw" as const })),
	);
	commit(table, [...hands, { do: "opening", action: "begin" }], "game-setup");
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
function declareOptions(table: Table, seat: SeatId): Option[] {
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
	if (!opening || mulligansSettled(table) || nextOpening(table)) throw new Error("The opening round still has a decision or is already settled");

	const taking = table.seats.filter((s) => opening.declared[s.id] === "mulligan");
	const changes: Change[] = [];
	for (const s of taking) {
		for (const card of cardsIn(table, "hand", s.id)) {
			changes.push({ do: "move", what: card.id, to: "library", reason: "game-setup" });
		}
		changes.push({ do: "shuffle", whose: s.id });
	}
	if (changes.length) commit(table, changes, "game-setup");

	// Drawn after the shuffle, so the new hand comes off a shuffled library.
	const draws = taking.flatMap((s) =>
		cardsIn(table, "library", s.id)
			.slice(0, table.format.startingHand)
			.map((card) => ({ do: "move" as const, what: card.id, to: "hand" as const, reason: "draw" as const })),
	);
	commit(table, [...draws, { do: "opening", action: "round" }], "game-setup");
}

/**
 * The options for the next card to put on the bottom.
 *
 * One card at a time, because three from seven is 210 ordered choices and an
 * option list has to be readable. The order chosen is the order they are
 * placed, which matters only when something later reads the bottom of a
 * library, and the rules give the seat that choice so it is recorded.
 */
function bottomOptions(table: Table, seat: SeatId): Option[] {
	const owes = table.opening?.owed[seat] ?? 0;
	return cardsIn(table, "hand", seat).map((card) => ({
		id: `bottom:${card.id}`,
		label: `Put ${card.card} on the bottom`,
		objects: [{ id: card.id, incarnation: card.incarnation }],
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

/**
 * Situation 7, in this order: put cards on the bottom, declare, then any
 * opening-hand action. pregame.ts owns the procedure and docs/MULLIGAN.md owns
 * the reasoning.
 */
export function nextOpening(table: Table): Pending | null {
	const round = table.opening;
	if (!round || mulligansSettled(table) || table.outcome) return null;

	// A seat owing cards to the bottom answers before anything else, because
	// its hand is not an opening hand until it does.
	for (const s of table.seats) {
		if ((round.owed[s.id] ?? 0) > 0) {
			return {
				situation: "pregame",
				seat: s.id,
				question: `Put ${round.owed[s.id]} card${round.owed[s.id] === 1 ? "" : "s"} on the bottom of your library.`,
				moves: bottomOptions(table, s.id).map((option) => ({
					option,
					changes: [
						{
							do: "move",
							what: option.id.slice("bottom:".length),
							to: "library",
							position: "bottom",
							reason: "game-setup",
						},
					],
					reason: "game-setup" as Reason,
				})),
			};
		}
	}

	// 103.5: the starting player declares, then each other seat in turn order.
	for (const s of table.seats) {
		if (round.kept.includes(s.id)) continue;
		if (round.declared[s.id]) continue;
		return {
			situation: "pregame",
			seat: s.id,
			question: `Keep this hand of ${cardsIn(table, "hand", s.id).length}?`,
			fallback: "keep",
			moves: declareOptions(table, s.id).map((option) => ({
				option,
				changes: [],
				reason: "game-setup" as Reason,
			})),
		};
	}

	// Every seat has declared. advance applies the round, because taking the
	// mulligans is not a decision.
	return null;
}

/** Completion follows from the outstanding obligations; it is not another flag. */
export function mulligansSettled(table: Table): boolean {
	const opening = table.opening;
	return !!opening && opening.kept.length === table.seats.length &&
		!Object.values(opening.owed).some((count) => count > 0);
}
