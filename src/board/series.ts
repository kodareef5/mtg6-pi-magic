/**
 * A game as a play-by-play: the board after each moment something visible
 * happened, as the audience and each seat saw it, with what happened. A
 * moment that leaves every board as it was, a step with no attackers or an
 * untap, joins the one before. Built while a saved game replays, so it calls
 * no models and changes nothing.
 */
import type { Table } from "../core/table.ts";
import type { Viewer } from "../core/types.ts";
import { project } from "../core/view.ts";
import { boardSnapshot, type BoardSnapshot } from "./snapshot.ts";

/** One viewer's board at a moment, and what that viewer saw happen. */
export type View = { snapshot: BoardSnapshot; lines: string[] };
/** A moment as every viewer saw it, in the order of the series' viewers: the audience, then each seat. */
export type Moment = { views: View[] };

/** A viewer's folder name: the audience, or a seat by number. */
export const viewerKey = (viewer: Viewer) => viewer === "spectator" ? "audience" : `seat-${viewer}`;

export function playByPlay(seats: { id: number; name: string; deck?: string }[]) {
	const viewers: Viewer[] = ["spectator", ...seats.map((one) => one.id)];
	const moments: Moment[] = [];
	let seen = 0, boards = "";
	return {
		viewers,
		moments,
		/** Look at the table: before each recorded decision, and once at the end. */
		take(table: Table) {
			if (table.log.length === seen) return;
			const views = viewers.map((viewer) => project(table, viewer, seen));
			seen = table.log.length;
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
