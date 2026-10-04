/** Priority actions. Timing gates belong here; a seat may still declare its own motion. */
import type { Move } from "./moves.ts";
import { cardsIn, seat, type Table } from "./table.ts";
import type { SeatId } from "./types.ts";

/** Situation 1. The table knows all of this without reading a card. */
export function priorityMoves(table: Table, holder: SeatId): Move[] {
	const moves: Move[] = [
		{ option: { id: "pass", label: "Pass" }, changes: [], reason: "game-setup" },
	];

	// Playing a land: one move per land in hand, when this seat has played
	// fewer than it may, it is this seat's main phase and the stack is empty.
	// Playing a land does not use the stack. 305.1.
	const step = table.cursor.steps[0] ?? "";
	const main = step === "precombat-main" || step === "postcombat-main";
	if (main && table.cursor.active === holder && seat(table, holder).landsPlayed < 1 && !cardsIn(table, "stack").length) {
		for (const card of cardsIn(table, "hand", holder)) {
			if (!isLand(card.card)) continue;
			moves.push({
				option: { id: `land:${card.id}`, label: `Play ${card.card}`, objects: [{ id: card.id, incarnation: card.incarnation }] },
				changes: [{ do: "move", what: card.id, to: "battlefield", reason: "play-land" }],
				reason: "play-land",
			});
		}
	}

	// Prepared spell and activation menus live in procedures.ts. Ordinary
	// discovery of those actions, alternative costs and special actions is unfinished.

	// Canonical order: pass, then lands by card name then by id. Same table,
	// same list, same order, so a seed replays.
	return [
		moves[0]!,
		...moves.slice(1).sort((a, b) => a.option.label.localeCompare(b.option.label) || a.option.id.localeCompare(b.option.id)),
	];
}

/** The engine knows a basic land's mana ability without reading its text. */
const isLand = (card: string | undefined) => card === "Forest" || card === "Swamp" || card === "Island" || card === "Mountain" || card === "Plains";

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
