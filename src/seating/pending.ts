/**
 * A chair is answered by a player. The host does not know which kind.
 *
 * Two kinds exist and they share one shape, which is why nothing else in this
 * repo branches on local against remote:
 *
 *   remote   a guest on a socket. The host writes a frame, the guest's own Pi
 *            calls table_act, the result comes back. Lives in table.ts.
 *   pending  a chair answered by the Pi process that holds it. `decide` hands
 *            back a promise and `supply` settles it from a tool call.
 *
 * The host's own chair uses `pending`. So does the guest side, because a guest
 * is also a Pi waiting for its human or its model to call a tool. One pattern,
 * both ends.
 */

import type { Frame, Pick } from "../core/types.ts";

export interface Player {
	readonly name: string;
	/** Called only when this seat's frame carries a decision. No timer bounds it. */
	decide(frame: Frame): Promise<Pick>;
	/** The table moved and it is not this seat's turn. Returns nothing. */
	observe(frame: Frame): void;
	close(): void;
}

export type PendingPlayer = Player & {
	/** The frame this chair is answering, or null when it is not its turn. */
	asked(): Frame | null;
	/** Settle the promise `decide` returned. Throws when nothing was asked. */
	supply(pick: Pick): void;
};

export function pendingPlayer(name: string): PendingPlayer {
	/*
	 * 1. Hold three things: the last frame seen, the frame being asked, and the
	 *    resolve function of the outstanding decide promise.
	 * 2. decide(frame): record it as asked, return a promise, keep its resolve.
	 *    A second decide before the first settles is a host bug, not a queue.
	 *    Throw rather than overwrite.
	 * 3. observe(frame): record it as the last frame seen. Do not touch asked.
	 * 4. supply(pick): if nothing is asked, throw so the caller can tell the
	 *    model it is not its turn. Otherwise clear asked and resolve.
	 * 5. close(): reject any outstanding promise so the host loop stops waiting
	 *    on a chair that left.
	 */
	void name;
	throw new Error("pendingPlayer is unwritten. Five steps above, no more.");
}
