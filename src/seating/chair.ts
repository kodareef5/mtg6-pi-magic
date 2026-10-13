/**
 * A chair answered over the wire, as the host's loop sees it: a player like any
 * other. When the loop asks, the chair holds the frame until its guest answers;
 * it judges the answer against the ask and hands it to the loop, which applies
 * its own rules as it does for every seat. The chair also carries the lobby's
 * agreements to its guest.
 *
 * Five verdicts are the whole concurrency story. An answer to an older ask is
 * stale. A resent actionId with the same answer is a replay and changes the
 * game once; with a different answer it is a duplicate. With no ask open it is
 * not this seat's turn, and a pick names a listed option or is refused.
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
		reset() { resets++; changed(); },
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
			const answer = post.answer, id = "actionId" in answer ? answer.actionId : undefined;
			const before = id === undefined ? undefined : applied.get(id);
			if (before !== undefined) return before === JSON.stringify(answer) ? { ok: true } : { ok: false, refused: "duplicate" };
			if (!asking) return { ok: false, refused: "not-your-turn" };
			if (post.ask !== asking.ask) return { ok: false, refused: "stale" };
			if (answer.kind === "pick" && !asking.frame.decision?.options.some((option) => option.id === answer.option))
				return { ok: false, refused: "unknown-option", message: `No option ${answer.option}.` };
			if (id !== undefined) applied.set(id, JSON.stringify(answer));
			const now = asking;
			asking = undefined;
			now.settle(answer);
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
