/**
 * A seat answered by a decision model.
 *
 * Three jobs, three calls, in this order: the intent prepares, the packet
 * focuses, the model picks an id. See AGENTS.md in this directory for why they
 * stay apart.
 */

import type { Player } from "../core/player.ts";
import type { DecisionApi } from "./model.ts";

export type AiSeatOptions = {
	name: string;
	api: DecisionApi;
	/** Recorded on the table when an answer comes back unusable. */
	onGap(note: string): void;
};

export function aiSeat(options: AiSeatOptions): Player {
	/*
	 * decide(frame):
	 *   1. Refuse a frame with no decision. That is a loop bug, not a pass.
	 *   2. Take this seat's intent. Prepare a new one only when the phase moved
	 *      or its assumptions broke.
	 *   3. focus(decision, intent, version) for the packet.
	 *   4. Ask one choice question: the packet as state, the options as
	 *      criteria, the decision's question as instructions.
	 *   5. An option id comes back: return it with a fresh actionId.
	 *   6. A route id comes back: follow it and ask again, at this same
	 *      decision. Bound how many times, and record reaching that bound as a
	 *      gap rather than as a pass.
	 *   7. An unlisted id: ask once more. Still unusable, take the first option,
	 *      call onGap with what came back, and carry on. A finished game with a
	 *      recorded gap beats a dead game at turn four.
	 *
	 * observe(frame): keep the latest frame so the next intent check can see
	 * what changed. No model call: watching is free and reacting is not.
	 */
	void options;
	throw new Error("aiSeat is unwritten. Seven steps above.");
}
