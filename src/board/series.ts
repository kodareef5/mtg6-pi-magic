/**
 * A game as a play-by-play: the board after each moment something visible
 * happened, as the audience and each seat saw it, with what happened. A
 * moment that leaves every board as it was, a step with no attackers or an
 * untap, joins the one before. Built while a saved game replays, so it calls
 * no models and changes nothing.
 */
import type { Table } from "../core/table.ts";
import type { Viewer } from "../core/types.ts";
import { perspective } from "../core/perspective.ts";
import { project } from "../core/view.ts";
import { boardSnapshot, type BoardSnapshot } from "./snapshot.ts";

/** One viewer's board at a moment, and what that viewer saw happen. */
export type View = { snapshot: BoardSnapshot; lines: string[] };
/** A moment as every viewer saw it, in the order of the series' viewers: the audience, then each seat. */
export type Moment = { views: View[] };

/** A viewer's folder name: the audience, or a seat by number. */
export const viewerKey = (viewer: Viewer) => viewer === "spectator" ? "audience" : `seat-${viewer}`;

/** `viewers` defaults to the audience and every seat; a live game shows the audience alone. */
export function playByPlay(seats: { id: number; name: string; deck?: string }[], viewers: Viewer[] = ["spectator", ...seats.map((one) => one.id)]) {
	const moments: Moment[] = [];
	let seen = 0, boards = "", looked: unknown;
	return {
		viewers,
		moments,
		/** Look at the table: before each recorded decision, and once at the end. */
		take(table: Table) {
			// A rollback rebuilds the log, so the entry looked at last is gone: the position play went back to is the next moment.
			if (seen && table.log[seen - 1] !== looked) {
				const ruled = table.rulings.at(-1), note = ruled && "by" in ruled ? ` The host's note: ${ruled.note}` : "";
				const line = `Play went back to an earlier position.${note}`;
				seen = table.log.length; looked = table.log.at(-1); boards = "";
				moments.push({ views: viewers.map((viewer) => ({ snapshot: boardSnapshot(perspective(table, viewer).hide(project(table, viewer)), seats, viewer), lines: [line] })) });
				return;
			}
			if (table.log.length === seen) return;
			const views = viewers.map((viewer) => perspective(table, viewer).hide(project(table, viewer, seen)));
			seen = table.log.length; looked = table.log.at(-1);
			if (!views.some((view) => view.since.length)) return;
			const now = views.map((view, at): View => ({ snapshot: boardSnapshot(view, seats, viewers[at]!), lines: [...view.since] }));
			const same = JSON.stringify(now.map(({ snapshot: { step: _step, ...rest } }) => rest)), last = moments.at(-1);
			if (last && same === boards) {
				now.forEach((view, at) => { last.views[at] = { snapshot: view.snapshot, lines: [...last.views[at]!.lines, ...view.lines] }; });
				return;
			}
			boards = same;
			moments.push({ views: now });
		},
	};
}

/** Where a moment is in the game, as a caption. */
export const when = (snapshot: BoardSnapshot) => snapshot.finished ? "Game over"
	: snapshot.turn ? `Turn ${snapshot.turn}, ${snapshot.seats.find((one) => one.id === snapshot.active)?.name ?? "?"}'s ${snapshot.step?.replace(/-/g, " ") ?? "turn"}`
	: "Opening hands";

/**
 * The moments as the audience alone saw them, for a game whose hands are not
 * yet everyone's to see: a moment only a seat noticed goes, and one that leaves
 * the audience's board as it was joins the one before.
 */
export function audienceOnly(moments: Moment[]): Moment[] {
	const shown: Moment[] = [];
	let board = "";
	for (const moment of moments) {
		const view = moment.views[0]!;
		if (!view.lines.length) continue;
		const { step: _step, ...rest } = view.snapshot, same = JSON.stringify(rest), last = shown.at(-1);
		if (last && same === board) { last.views[0] = { snapshot: view.snapshot, lines: [...last.views[0]!.lines, ...view.lines] }; continue; }
		board = same;
		shown.push({ views: [{ snapshot: view.snapshot, lines: [...view.lines] }] });
	}
	return shown;
}
