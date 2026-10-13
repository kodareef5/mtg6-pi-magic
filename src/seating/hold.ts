/**
 * The host's hold on a game it runs: pause, continue, the two directions that
 * need the loop stopped first, a rollback and an end, and the table's clock.
 *
 * The clock runs while a seat waits on its player, never while its AI thinks.
 * A player who does not answer within it concedes: the hold stops the loop and
 * the concession is applied between loops, recorded as a timeout. That is also
 * how a player who left leaves the game. The AI never answers in their place.
 * Pausing stops the clock, and continuing gives the player being asked their
 * full time again.
 *
 * It wraps each seat's player, so it needs no change to the loop. A paused
 * seat's answer waits; a direction stops the loop at once, dropping an answer
 * still being thought about, and is applied to the stopped table between loops.
 * Nothing here answers a decision.
 */

import { concede } from "../core/concede.ts";
import { endByHost, rollbackByHost } from "../core/host.ts";
import { TableHalted, type Player } from "../core/player.ts";
import type { Table } from "../core/table.ts";
import type { SeatId } from "../core/types.ts";

/** `leave` stops the run and writes nothing, so the game can be resumed: what a closing Pi does. */
export type Direction = { do: "rollback"; to: number; note: string } | { do: "end"; note: string } | { do: "leave" } | { do: "timeout"; seat: SeatId };

export type Hold = ReturnType<typeof hold>;

/**
 * `applied` hears each direction once the stopped table carries it, or why the
 * table refused it. A refused direction changes nothing and play goes on.
 */
export function hold(restart: () => Table, applied?: (direction: Direction, table: Table, refused?: string) => void) {
	let paused = false, direction: Direction | null = null, waiting: (() => void)[] = [];
	let asking: { seat: SeatId; since: number; clock?: number } | null = null, timer: ReturnType<typeof setTimeout> | undefined;
	const clock = () => {
		clearTimeout(timer);
		const now = asking;
		if (now?.clock) timer = setTimeout(() => self.direct({ do: "timeout", seat: now.seat }), now.clock * 1000);
	};
	const halting = () => {
		let reject!: (error: Error) => void;
		const promise = new Promise<never>((_, no) => { reject = no; });
		promise.catch(() => {});
		return { promise, reject };
	};
	let halt = halting();

	const self = {
		paused: () => paused,
		/** The seat being asked now and since when, for the host's status line. */
		asking: () => asking,
		pause() { paused = true; clearTimeout(timer); },
		resume() {
			paused = false;
			const now = waiting; waiting = []; for (const go of now) go();
			if (asking) { asking.since = Date.now(); clock(); }
		},
		/** Stop the loop now and apply this between loops. A paused game stays paused after a rollback. */
		direct(next: Direction) { direction = next; halt.reject(new TableHalted(`The host directed: ${next.do}.`)); },
		checkpoint() { if (direction) throw new TableHalted(`The host directed: ${direction.do}.`); },
		/** Apply the waiting direction to a stopped table. True to play on. */
		halted(table: Table): boolean {
			const next = direction;
			direction = null; halt = halting();
			try {
				if (next?.do === "end") endByHost(table, next.note);
				else if (next?.do === "rollback") rollbackByHost(table, next.to, next.note, restart);
				else if (next?.do === "timeout") concede(table, next.seat, "timeout");
			} catch (error) {
				applied?.(next!, table, error instanceof Error ? error.message : String(error));
				return true;
			}
			if (next) applied?.(next, table);
			return next?.do !== "end" && next?.do !== "leave" && !table.outcome;
		},
		/**
		 * Start the clock on the seat being asked, for `seconds`, when its player is
		 * shown the question; stop it, with no seconds, when they are not.
		 */
		clock(id: SeatId, seconds?: number) {
			if (asking?.seat !== id) return;
			if (seconds) Object.assign(asking, { since: Date.now(), clock: seconds });
			else delete asking.clock;
			if (!paused) clock();
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
					try { return await Promise.race([thinking, halt.promise]); } finally { asking = null; clearTimeout(timer); }
				},
				observe: (frame) => player.observe(frame),
				...(player.interject ? { interject: (frame) => player.interject!(frame) } : {}),
				...(player.reset ? { reset: () => player.reset!() } : {}),
				close: () => player.close(),
			};
		},
	};
	return self;
}
