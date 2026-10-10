/**
 * The host. It owns the state, hands out chairs, and judges every pick.
 *
 * The socket half is unwritten. The judging half is here and complete, because
 * it is the part that decides whether two agents can trust the same table.
 */

import type { Decision, Outcome, SeatId } from "../core/types.ts";
import type { Act, Invite, Refusal } from "./protocol.ts";

/**
 * What the host does with a pick.
 *
 * `replay` is not a refusal. A guest that resends the same actionId after a
 * dropped socket gets the original answer back and the game changes once.
 * `duplicate` means the same actionId arrived carrying a different pick, which
 * only happens when a guest reuses an id, so the host refuses rather than
 * guessing which pick was meant.
 */
export type Verdict =
	| { kind: "apply" }
	| { kind: "replay" }
	| { kind: "refuse"; refused: Refusal };

export type JudgeInput = {
	version: number;
	decision: Decision | null;
	/** actionId to the option it carried, for every pick already applied. */
	applied: ReadonlyMap<string, string>;
};

export function judgeAct(act: Act, at: JudgeInput): Verdict {
	const previous = at.applied.get(act.actionId);
	if (previous !== undefined) {
		return previous === act.option
			? { kind: "replay" }
			: { kind: "refuse", refused: "duplicate" };
	}
	if (act.version !== at.version) return { kind: "refuse", refused: "stale" };
	if (at.decision === null || at.decision.seat !== act.seat) {
		return { kind: "refuse", refused: "not-your-turn" };
	}
	if (!at.decision.options.some((option) => option.id === act.option)) {
		return { kind: "refuse", refused: "unknown-option" };
	}
	return { kind: "apply" };
}

export type TableOptions = {
	/** The game type the table runs. */
	game: string;
	seats: number;
	/** Recorded, so the game replays. */
	seed?: string;
	/** Default 127.0.0.1. Nothing here traverses a NAT. */
	host?: string;
	/** Default 0, meaning the operating system picks a free one. */
	port?: number;
};

export type Table = {
	/** One invite per open chair. The first guest to present it claims that chair. */
	invite(seat: SeatId): Invite;
	status(): { game: string; version: number; seats: SeatId[]; claimed: SeatId[] };
	/** Resolves when the game records an outcome. */
	finished(): Promise<Outcome>;
	close(): Promise<void>;
};

/**
 * This does not get its own loop. src/loop.ts already runs the game, and a
 * remote seat is a Player like any other: it answers decide() from a socket
 * instead of from a model. So the work here is a server, a chair claim, and
 * `remotePlayer`, and nothing that duplicates the loop.
 *
 * Two rules it must not break. The host projects before it writes to a socket,
 * never after. A refusal names its reason rather than dropping the pick.
 */
export async function hostTable(options: TableOptions): Promise<Table> {
	throw new Error(
		`hostTable is unwritten. It needs: a WebSocket server on ${options.host ?? "127.0.0.1"}, ` +
			"one invite per chair, the loop above, and a per seat record of applied actionIds. " +
			"See src/core/AGENTS.md for the invariants it has to hold and docs/SEATING.md for the wire.",
	);
}
