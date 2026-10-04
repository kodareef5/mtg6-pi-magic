/** Ordinary actions from a seat's accepted interpretations, offered at every priority.
 * The table checks timing, sources, payment and targets, not that an interpretation
 * matches its card. Mana abilities are used inside payments, not offered on their own.
 */
import { offers } from "./procedures.ts";
import { project } from "./view.ts";
import type { Move } from "./moves.ts";
import type { Table } from "./table.ts";
import type { Frame, SeatId } from "./types.ts";

export function interpretedMoves(table: Table, holder: SeatId): Move[] {
	const work = table.work[holder];
	if (!work?.interpretations?.length) return [];
	const frame: Frame = { seat: holder, version: table.cursor.clock, view: project(table, holder) };
	const missing = new Set((work.missing ?? []).map((entry) => entry.card));
	return work.interpretations.filter(({ procedure }) => procedure.timing !== "mana" && !missing.has(procedure.source.card!))
		.flatMap(({ id, procedure }) => offers(procedure, frame, `play:${id}`).map(({ option, activation }) => ({
			option, activation, changes: [], reason: activation.timing === "spell" ? "cast" as const : activation.timing === "land" ? "play-land" as const : "activate" as const,
		})));
}

/** This seat's visible cards with rules text and no interpretation yet. */
export function uninterpreted(frame: Frame): string[] {
	const work = frame.view.work;
	const known = new Set([...(work?.interpretations ?? []).map(({ procedure }) => procedure.source.card), ...(work?.missing ?? []).map((entry) => entry.card)]);
	return [...new Set((frame.view.objects ?? []).flatMap((object) => object.card && object.controller === frame.seat && ["hand", "battlefield"].includes(object.zone) &&
		frame.view.printed?.[object.card]?.text && !known.has(object.card) ? [object.card] : []))].sort();
}
