/**
 * A chair answered over the wire, as the host's loop sees it: a player like any
 * other. When the loop asks, the chair holds the frame until its guest answers,
 * matches the answer to the ask, and hands it to the loop. The loop judges it
 * as it judges every seat's: an unlisted pick is refused and asked once more,
 * then the table takes the terminating option and records a gap. The chair
 * also carries the lobby's agreements to its guest.
 *
 * Four verdicts are the chair's whole concurrency story. An answer to an older
 * ask is stale. A resent actionId with the same answer is a replay and changes
 * the game once; with a different answer it is a duplicate. With no ask open it
 * is not this seat's turn.
 */

import { PlayerUnavailable, type Answer, type Player } from "../core/player.ts";
import type { Frame } from "../core/types.ts";
import type { Agreement } from "./lobby.ts";
import type { Answering, Result } from "./protocol.ts";

export type Chair = ReturnType<typeof chair>;

/** `changed` is told whenever something the guest may see moves, so a held poll can return. */
export function chair(name: string, changed: () => void) {
	let latest: Frame | undefined, asking: { frame: Frame; ask: number; settle(answer: Answer): void; fail(error: Error): void } | undefined;
	let asks = 0, resets = 0, closed = false, agreement: { what: Agreement; settle(yes: boolean): void } | undefined;
	const applied = new Map<string, string>();

	const player: Player = {
		name,
		answer(frame) {
			// An ask the loop abandoned, when the host stopped it, gives way to the new one.
			asking?.fail(new Error("A newer ask replaced this one."));
			latest = frame;
			const ask = ++asks;
			const answered = new Promise<Answer>((settle, fail) => { asking = { frame, ask, settle, fail }; });
			changed();
			return answered;
		},
		observe(frame) { latest = frame; changed(); },
		// A rewind withdraws the open ask: the loop asks again from the position it went back to.
		reset() { asking?.fail(new Error("The game went back; this ask is withdrawn.")); asking = undefined; resets++; changed(); },
		close() {
			closed = true;
			asking?.fail(new PlayerUnavailable(`${name} left the table.`));
			asking = undefined;
			changed();
		},
	};

	return {
		player,
		/** What the guest may see of this chair now. */
		seen: () => ({ ...(latest ? { frame: latest } : {}), ...(asking ? { ask: asking.ask } : {}), resets,
			...(agreement ? { agreement: agreement.what } : {}) }),
		closed: () => closed,
		supply(post: Answering): Result {
			const answer = "answer" in post ? post.answer : undefined, id = answer && "actionId" in answer ? answer.actionId : undefined;
			const before = id === undefined ? undefined : applied.get(id);
			if (before !== undefined) return before === JSON.stringify(answer) ? { ok: true } : { ok: false, refused: "duplicate" };
			if (!asking) return { ok: false, refused: "not-your-turn" };
			if (post.ask !== asking.ask) return { ok: false, refused: "stale" };
			if (id !== undefined) applied.set(id, JSON.stringify(answer));
			const now = asking;
			asking = undefined;
			const failed = `The seat's player failed: ${"failed" in post ? String(post.failed).slice(0, 500) : "no answer"}`;
			if (answer) now.settle(answer);
			else now.fail("unavailable" in post && post.unavailable ? new PlayerUnavailable(failed) : new Error(failed));
			changed();
			return { ok: true };
		},
		/** Ask the guest to agree. Resolves with its answer; a chair nobody has claimed yet waits for one. */
		request(what: Agreement): Promise<boolean> {
			agreement?.settle(false);
			const answered = new Promise<boolean>((settle) => { agreement = { what, settle }; });
			changed();
			return answered;
		},
		agree(what: Agreement, yes: boolean): Result {
			if (agreement?.what !== what) return { ok: false, refused: "not-now", message: `Nothing asks this seat to ${what}.` };
			const now = agreement;
			agreement = undefined;
			now.settle(yes);
			changed();
			return { ok: true };
		},
	};
}
