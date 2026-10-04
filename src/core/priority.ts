/** Priority actions. Timing gates belong here; a seat may still declare its own motion. */
import type { Move } from "./moves.ts";
import { cardsIn, seat, type Table } from "./table.ts";
import { facts, isLand, permanentSpell } from "./printed.ts";
import { offers } from "./announce.ts";
import { entering } from "./entry.ts";
import { project } from "./view.ts";
import { tableWorld } from "./selectors.ts";
import { allowance, playable } from "./permits.ts";
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
	// A permanent may permit more land plays, or lands from another zone.
	const step = table.cursor.steps[0] ?? "";
	const main = step === "precombat-main" || step === "postcombat-main";
	const world = tableWorld(table);
	if (main && table.cursor.active === holder && seat(table, holder).landsPlayed < allowance(world, holder).lands && !cardsIn(table, "stack").length) {
		for (const card of [...table.things.values()]) {
			if (!card.card || !isLand(facts(table, card)) || !["hand", "graveyard", "exile"].includes(card.zone) || !playable(world, holder, card, table.cursor.turn, true)) continue;
			const note = entering(table, holder, card.card!);
			moves.push({
				option: { id: `land:${card.id}`, label: `Play ${card.card}${card.zone === "hand" ? "" : ` from ${card.zone}`}`, objects: [{ id: card.id, incarnation: card.incarnation }], ...(note ? { shows: note } : {}) },
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
	const world = tableWorld(table);
	// From hand, and from another zone where a permission names the card ("you may cast it from exile").
	const castable = [...table.things.values()].filter((card) => card.zone !== "battlefield" && card.zone !== "stack" && permanentSpell(facts(table, card)) &&
		(card.zone === "hand" ? card.owner === holder : playable(world, holder, card, table.cursor.turn, false)));
	const sources = [...new Set(castable.map((card) => `${card.zone}|${card.card}`))].sort().map((key) => key.split("|") as ["hand" | "exile" | "graveyard", string]);
	return sources.flatMap(([zone, name]) => offers({ source: { zones: [zone], controller: "self", card: name }, claim: zone === "hand" ? "Cast for its printed cost" : `Cast from ${zone} for its printed cost`,
		basis: `Printed ${table.printed[name]!.type}, ${table.printed[name]!.mana}`, timing: "spell", instructions: [] }, frame, zone === "hand" ? "cast" : "play").map(({ option, activation }) => {
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
