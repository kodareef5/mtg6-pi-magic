/**
 * Pictures of a running game. Each call captures the board as a spectator sees it at that moment,
 * then draws it in order, off the game loop, saves the PNG and hands it on. Drawing never delays play;
 * a missing renderer or a failed picture is reported once and the game carries on.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { project } from "../core/view.ts";
import type { Table } from "../core/table.ts";
import { boardSnapshot } from "./snapshot.ts";
import { boardPng, type BoardRenderer } from "./render.ts";

export function boardFeed(table: Table, renderer: Promise<BoardRenderer | null>, dir: string,
	show: (png: Uint8Array, path: string, label: string) => void, problem: (message: string) => void) {
	let queue: Promise<void> = Promise.resolve(), told = false;
	const once = (message: string) => { if (!told) { told = true; problem(message); } };
	return {
		take(label: string): void {
			const snapshot = boardSnapshot(project(table, "spectator"), table.seats.map((seat) => ({ id: seat.id, name: seat.name, deck: seat.deck.name })), "spectator");
			queue = queue.then(async () => {
				const drawer = await renderer;
				if (!drawer) return once("No board renderer is installed (optional dependency cardboard-api); playing without pictures.");
				const png = await boardPng(drawer, snapshot);
				mkdirSync(dir, { recursive: true });
				const path = join(dir, `${label}.png`);
				writeFileSync(path, png);
				show(png, path, label);
			}).catch((error) => once(`A board picture failed; later pictures are still attempted: ${String(error)}`));
		},
		/** Resolves once every picture asked for so far is drawn or has failed. */
		settled: () => queue,
	};
}
