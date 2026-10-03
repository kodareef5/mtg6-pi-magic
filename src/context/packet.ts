/**
 * What a decision model is shown for one decision.
 *
 * The core knows everything. A decision model answers one narrow question well
 * and badly when it is handed everything, so something has to choose which
 * slice of the core matters here. That choosing is this file, and it is why the
 * decision context engine is separate from the game engine.
 *
 * Nothing here writes to the table.
 */

import type { Decision, SeatId } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";

/** A predefined route out of this decision. Not prose, and not a new move. */
export type Route = "more-options" | "better-targets" | "replan";

export type Packet = {
	actor: SeatId;
	/** The exact pending step, named, not described. */
	step: string;
	/** The table version this was built from. A later answer against it is stale. */
	version: number;
	/** The remaining obligation in one sentence: what still has to be settled. */
	obligation: string;
	/** Choices already locked in this action, so the model does not relitigate them. */
	committed: string[];
	/** What is available to spend, with each source's own restrictions kept. */
	resources: string[];
	/** Every option, at equal detail, with its consequence where one is known. */
	options: { id: string; label: string; shows?: string; consequence?: string }[];
	/** Ordered, from the seat's intent. First one that applies wins. */
	priorities: string[];
	/** Facts, separated from guesses about what an opponent will do. */
	known: string[];
	assumed: string[];
	/** Route id to what asking for it does. */
	routes: Partial<Record<Route, string>>;
};

/**
 * Build the packet.
 *
 * What goes in: every fact that changes what is legal, the terms that interact
 * with this decision, and any unresolved clause that could bear on it. Small is
 * a retrieval discipline, not permission to drop an inconvenient rule. A packet
 * that omits a standing restriction is wrong, not compact.
 *
 * What stays out: history nobody will use, the changes behind an option, and
 * anything this seat has not earned.
 *
 * How it reads: equal detail per option, because a brilliant winning line
 * beside waste resources manufactures a preference without any analysis. A
 * conditional outcome is shown as conditional, because an opponent's unseen
 * answer is not a known future event.
 */
export function focus(decision: Decision, intent: Intent, version: number): Packet {
	/*
	 * 1. Name the step and the obligation from the decision's own situation.
	 * 2. Pull the resources and the interacting facts from core derived data,
	 *    for this seat only.
	 * 3. Copy the options through unchanged. Ids are never renumbered: a
	 *    renumbered id is an unplayable answer.
	 * 4. Take the priorities from the intent, in order. A priority is a
	 *    proposal about preference, never a condition on legality.
	 * 5. Offer the routes that apply. More options when the list may be
	 *    incomplete, better targets when a target slot has many candidates,
	 *    replan when the plan's assumptions no longer hold.
	 */
	void [decision, intent, version];
	throw new Error("focus is unwritten. Five steps above.");
}

/**
 * Whether to put conceding in front of a decision model.
 *
 * It is always available to the seat. Whether it is listed is a separate
 * question, and listing it when the game is live is how a model learns to quit
 * instead of think.
 *
 * List it when the result is already settled and only the stepping through is
 * left: a sequence on the table that ends the game whatever this seat does,
 * with several resolutions already passed and no seat objecting, or a loop with
 * no exit this seat can take. A model may then concede the way a chess player
 * resigns, to save the other seats the clicking.
 *
 * Leave it out otherwise. Another seat can still play badly, so a position that
 * merely looks lost is not lost, and the cheaper answer is to let the decision
 * model do the work.
 */
export function offerConcede(packet: Packet): boolean {
	void packet;
	throw new Error("offerConcede is unwritten: settled sequence or inescapable loop only.");
}

/**
 * Follow a route. Every one returns to this same decision.
 *
 * A route does not pass, does not undo a paid cost, does not change a locked
 * choice, and does not reveal anything this seat has not earned.
 *
 * - more-options widens the list mechanically first. The playable space is
 *   larger than the shortlist, and a shortlist of one is not proof that the
 *   choice was forced.
 * - better-targets re-asks the target slot with the candidates spelled out.
 * - replan rewrites the seat's intent, which can change the priorities but
 *   cannot make a legal option disappear.
 *
 * When a widened list still has nothing usable, record the gap and play on.
 */
export function follow(route: Route, packet: Packet): Packet {
	void [route, packet];
	throw new Error("follow is unwritten. Three routes, all returning here.");
}
