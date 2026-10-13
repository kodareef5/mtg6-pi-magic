/**
 * A game as a play-by-play picture series: the board after each moment
 * something visible happened, as one viewer saw it, with what happened. A
 * moment that leaves the board as it was, a step with no attackers or an
 * untap, joins the picture before it. Built while a saved game replays, so it
 * calls no models and changes nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Table } from "../core/table.ts";
import type { Viewer } from "../core/types.ts";
import { project } from "../core/view.ts";
import { boardPicture, type BoardRenderer, type BoardSize, type Dress } from "./render.ts";
import { boardSnapshot, type BoardSnapshot } from "./snapshot.ts";
import { viewerHtml, type Stats } from "./viewer.ts";

export type Moment = { snapshot: BoardSnapshot; lines: string[] };

export function playByPlay(viewer: Viewer, seats: { id: number; name: string; deck?: string }[]) {
	const moments: Moment[] = [];
	let seen = 0, board = "";
	return {
		moments,
		/** Look at the table: before each recorded decision, and once at the end. */
		take(table: Table) {
			if (table.log.length === seen) return;
			const view = project(table, viewer, seen);
			seen = table.log.length;
			if (!view.since.length) return;
			const snapshot = boardSnapshot(view, seats, viewer), { step: _step, ...rest } = snapshot, same = JSON.stringify(rest);
			const last = moments.at(-1);
			if (last && same === board) { last.snapshot = snapshot; last.lines.push(...view.since); return; }
			board = same;
			moments.push({ snapshot, lines: [...view.since] });
		},
	};
}

/** Where a moment is in the game, as a caption. */
const when = (snapshot: BoardSnapshot) => snapshot.finished ? "Game over"
	: snapshot.turn ? `Turn ${snapshot.turn}, ${snapshot.seats.find((one) => one.id === snapshot.active)?.name ?? "?"}'s ${snapshot.step?.replace(/-/g, " ") ?? "turn"}`
	: "Opening hands";

/**
 * Draw the series into `dir`: a numbered picture per moment, named by turn,
 * `index.html` to flip through them with the game's numbers, and `index.md`
 * with each picture's caption and lines. A picture that fails is noted and
 * the series goes on. `progress` hears each picture.
 */
export async function drawSeries(moments: Moment[], renderer: BoardRenderer, dir: string, title: string,
	options: { subtitle?: string; stats?: Stats; dress?: Dress; size?: BoardSize; progress?(done: number, total: number): void } = {}): Promise<{ files: string[]; failed: number }> {
	mkdirSync(dir, { recursive: true });
	const files: string[] = [], drawn: (string | null)[] = [], index = [`# ${title}`, ...(options.subtitle ? ["", options.subtitle] : []), ""];
	let failed = 0, turn = 0;
	for (const [at, moment] of moments.entries()) {
		// A finished board has no turn of its own; it keeps the last one's.
		turn = moment.snapshot.turn ?? turn;
		const name = `${String(at + 1).padStart(4, "0")}-turn-${String(turn).padStart(2, "0")}.webp`;
		let shown: string;
		try {
			writeFileSync(join(dir, name), await (await boardPicture(renderer, moment.snapshot, options.dress, options.size)).webp());
			files.push(name);
			drawn.push(name);
			shown = `![${name}](${name})`;
		} catch (error) { failed++; drawn.push(null); shown = `Not drawn: ${error instanceof Error ? error.message : String(error)}`; }
		index.push(`## ${at + 1}. ${when(moment.snapshot)}`, "", shown, "", ...moment.lines.map((line) => `- ${line}`), "");
		options.progress?.(at + 1, moments.length);
	}
	writeFileSync(join(dir, "index.md"), index.join("\n"));
	writeFileSync(join(dir, "index.html"), viewerHtml(title, options.subtitle ?? "", moments, drawn, options.stats));
	return { files, failed };
}
