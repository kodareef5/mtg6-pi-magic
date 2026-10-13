/**
 * The host's hold on a game it runs: pause, continue, and the two directions
 * that need the loop stopped first, a rollback and an end.
 *
 * It wraps each seat's player, so it needs no change to the loop. A paused
 * seat's answer waits; a direction stops the loop at once, dropping an answer
 * still being thought about, and is applied to the stopped table between loops.
 * The host is never a seat: nothing here answers a decision.
 */

import { endByHost, rollbackByHost } from "../core/host.ts";
import { TableHalted, type Player } from "../core/player.ts";
import type { Table } from "../core/table.ts";
import type { SeatId } from "../core/types.ts";

/** `leave` stops the run and writes nothing, so the game can be resumed: what a closing Pi does. */
export type Direction = { do: "rollback"; to: number; note: string } | { do: "end"; note: string } | { do: "leave" };

export type Hold = ReturnType<typeof hold>;

/** `applied` hears each direction once the stopped table carries it. */
export function hold(restart: () => Table, applied?: (direction: Direction, table: Table) => void) {
	let paused = false, direction: Direction | null = null, waiting: (() => void)[] = [];
	let asking: { seat: SeatId; since: number } | null = null;
	const halting = () => {
		let reject!: (error: Error) => void;
		const promise = new Promise<never>((_, no) => { reject = no; });
		promise.catch(() => {});
		return { promise, reject };
	};
	let halt = halting();

	return {
		paused: () => paused,
		/** The seat being asked now and since when, for the host's status line. */
		asking: () => asking,
		pause() { paused = true; },
		resume() { paused = false; const now = waiting; waiting = []; for (const go of now) go(); },
		/** Stop the loop now and apply this between loops. A paused game stays paused after a rollback. */
		direct(next: Direction) { direction = next; halt.reject(new TableHalted(`The host directed: ${next.do}.`)); },
		checkpoint() { if (direction) throw new TableHalted(`The host directed: ${direction.do}.`); },
		/** Apply the waiting direction to a stopped table. True to play on. */
		halted(table: Table): boolean {
			const next = direction;
			direction = null; halt = halting();
			if (next?.do === "end") endByHost(table, next.note);
			else if (next?.do === "rollback") rollbackByHost(table, next.to, next.note, restart);
			if (next) applied?.(next, table);
			return next?.do !== "end" && next?.do !== "leave";
		},
		seat(player: Player, id: SeatId): Player {
			return {
				name: player.name,
				async answer(frame) {
					while (paused && !direction) await Promise.race([new Promise<void>((go) => waiting.push(go)), halt.promise]);
					if (direction) throw new TableHalted(`The host directed: ${direction.do}.`);
					asking = { seat: id, since: Date.now() };
					const thinking = player.answer(frame);
					thinking.catch(() => {});
					try { return await Promise.race([thinking, halt.promise]); } finally { asking = null; }
				},
				observe: (frame) => player.observe(frame),
				...(player.interject ? { interject: (frame) => player.interject!(frame) } : {}),
				...(player.reset ? { reset: () => player.reset!() } : {}),
				close: () => player.close(),
			};
		},
	};
}
