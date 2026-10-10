/**
 * The guest. One socket, the latest frame, one pick at a time.
 *
 * A guest holds no state of its own beyond the last frame it received. When the
 * host refuses a pick as stale, the guest reads the newer frame and picks again.
 * It never reconciles, merges or predicts.
 */

import type { Frame } from "../core/types.ts";
import type { Result } from "./protocol.ts";

export type Seat = {
	/** The last frame the host pushed. It can be stale by the time you act on it. */
	frame(): Frame | null;
	/** Resolves with the host's answer, which is not the resolved effect. */
	act(option: string): Promise<Result>;
	/** Resolves when the next frame arrives, for waiting out another seat's turn. */
	next(): Promise<Frame>;
	close(): void;
};

export async function joinTable(invite: string, name: string): Promise<Seat> {
	throw new Error(
		`joinTable is unwritten. It needs: parseInvite, a WebSocket dial, hello with the secret, ` +
			`welcome, then a frame cache for ${name}. See src/core/AGENTS.md and docs/SEATING.md.`,
	);
}
