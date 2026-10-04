/** Ordinary actions from declared card support, offered at every priority.
 * A supported line is the accepted meaning of a card; the table checks timing,
 * sources, payment and targets for each interpretation. Seating refuses a game
 * with an unsupported card, so nothing here stands in for missing meaning.
 */
import { offers } from "./procedures.ts";
import { project } from "./view.ts";
import type { Move } from "./moves.ts";
import type { Table } from "./table.ts";
import type { Frame, SeatId } from "./types.ts";

export function interpretedMoves(table: Table, holder: SeatId): Move[] {
	const frame: Frame = { seat: holder, version: table.cursor.clock, view: project(table, holder) };
	const owned = new Set((frame.view.objects ?? []).flatMap((object) => object.card && object.controller === frame.seat ? [object.card] : []));
	return [...owned].sort().flatMap((card) => {
		const line = table.support[card];
		// A mana ability is offered inside a payment (601.2g), not as a move of its own.
		return line?.status !== "supported" ? [] : line.interpretations.filter(({ procedure }) => procedure.timing !== "mana").flatMap(({ id, procedure }) => offers(procedure, frame, `play:${id}`).map(({ option, activation }) => ({
			option, activation, changes: [], reason: activation.timing === "spell" ? "cast" as const : activation.timing === "land" ? "play-land" as const : "activate" as const,
		})));
	});
}
