/** Priority actions. Timing gates belong here; a seat may still declare its own motion. */
import type { Move } from "./moves.ts";
import { cardsIn, seat, type Table } from "./table.ts";
import { facts, isLand, permanentSpell } from "./printed.ts";
import { offers } from "./announce.ts";
import { entering } from "./entry.ts";
import { project } from "./view.ts";
import type { Frame, SeatId } from "./types.ts";

/** Situation 1. The table knows all of this without reading a card. */
export function priorityMoves(table: Table, holder: SeatId): Move[] {
	const moves: Move[] = [
		{ option: { id: "pass", label: "Pass" }, changes: [], reason: "game-setup" },
	];

	// Playing a land: one move per land in hand, when this seat has played fewer
	// than it may, it is this seat's main phase and the stack is empty. What the
	// land registers comes from the seat's package as it enters.
	// Playing a land does not use the stack. 305.1.
	const step = table.cursor.steps[0] ?? "";
	const main = step === "precombat-main" || step === "postcombat-main";
	if (main && table.cursor.active === holder && seat(table, holder).landsPlayed < 1 && !cardsIn(table, "stack").length) {
		for (const card of cardsIn(table, "hand", holder)) {
			if (!isLand(facts(table, card))) continue;
			const note = entering(table, holder, card.card!);
			moves.push({
				option: { id: `land:${card.id}`, label: `Play ${card.card}`, objects: [{ id: card.id, incarnation: card.incarnation }], ...(note ? { shows: note } : {}) },
				changes: [{ do: "move", what: card.id, to: "battlefield", reason: "play-land" }],
				reason: "play-land",
			});
		}
	}


	// Canonical order: pass, then lands by card name then by id. Same table,
	// same list, same order, so a seed replays.
	return [
		moves[0]!,
		...moves.slice(1).sort((a, b) => a.option.label.localeCompare(b.option.label) || a.option.id.localeCompare(b.option.id)),
	];
}


/**
 * Casting a permanent spell for its printed cost needs no card text: it goes on
 * the stack and enters the battlefield. One option per distinct name, source and
 * payment, in a main phase with an empty stack. An Aura needs a target and an
 * X cost needs a number, so both wait for a seat's own procedure, as does
 * anything the card does beyond entering.
 */
export function defaultCasts(table: Table, holder: SeatId): Move[] {
	const frame: Frame = { seat: holder, version: table.cursor.clock, view: project(table, holder) };
	const names = [...new Set(cardsIn(table, "hand", holder).filter((card) => permanentSpell(facts(table, card))).map((card) => card.card!))].sort();
	return names.flatMap((name) => offers({ source: { zones: ["hand"], controller: "self", card: name }, claim: "Cast for its printed cost",
		basis: `Printed ${table.printed[name]!.type}, ${table.printed[name]!.mana}`, timing: "spell", instructions: [] }, frame, "cast").map(({ option, activation }) => {
		const note = entering(table, holder, name);
		return { option: { ...option, ...(note ? { shows: `${option.shows} ${note}` } : {}) }, activation, changes: [], reason: "cast" as const };
	}));
}

/**
 * A move is offered only when every one of these holds. This is the whole
 * notion of legality and none of it reads printed text.
 *
 * 1. The seat may act in this window.
 * 2. The cost is locked and a payment plan exists.
 * 3. Every target has at least its minimum of legal objects in this seat's view.
 * 4. Every amount evaluates, and every binding it reads was declared earlier.
 * 5. No limit is exhausted, read off the marker rather than remembered.
 * 6. No standing restriction forbids it.
 * 7. The changes apply cleanly to a trial copy of the table.
 *
 * Milestone one checks what it has: every object a move names is still where
 * the move thinks it is. Costs, targets, limits and restrictions arrive with
 * cards, and the trial application arrives with them, because cloning the
 * table per option only earns its cost once a move can fail in a way the
 * builder did not foresee.
 */
export function legal(table: Table, move: Move): boolean {
	return move.changes.every((change) => !("what" in change) || table.things.has(change.what));
}
