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

import type { Frame, SeatId, Window } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import type { Brief } from "./brief.ts";
import type { Recap } from "./summary.ts";

/**
 * What the pregame and the commentator left behind, shared by every seat.
 *
 * One object for the whole table, held by reference, because the recaps grow as
 * the game runs and a seat that copied them at the start would read a stale
 * game. The briefs are per seat and a seat reads only its own.
 */
export type Chronicle = { briefs: Record<SeatId, Brief>; recaps: Recap[] };

/** A predefined route out of this decision. Not prose, and not a new move. */
export type Route = "more-options" | "better-targets" | "replan";

export type Packet = {
	actor: SeatId;
	/** Opening and turn context are distinct; no phase is inferred from prose. */
	window: Window;
	/** The table revision this was built from. A later answer against it is stale. */
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
	/**
	 * The pregame snippets that apply here: the one written for this window, and
	 * a note for each card this seat can see that has one. Filed by injection
	 * site in `brief.ts` precisely so this list is short, and a card note costs
	 * nothing on a turn where its card never appears.
	 */
	guidance: string[];
	/**
	 * What has been happening, from the public turn recaps. Not the log: a
	 * decision wants three sentences about the last three turns, not two hundred
	 * receipts, and the recap is already filtered to what a spectator may read.
	 */
	lately: string[];
	/** Route id to what asking for it does. */
	routes: Partial<Record<Route, string>>;
	/**
	 * Why the answers already sent for this decision were not taken. Present
	 * only on a retry, and the obligation and the options are unchanged. A model
	 * handed the identical packet twice sends the identical answer twice, so the
	 * refusal has to survive the trip from the frame to the request.
	 */
	refused?: string[];
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
 *
 * `context` is what the pregame and the commentator left behind. It is optional
 * because a seat with no brief still has to be able to play: a missing snippet
 * costs quality, and refusing to build a packet without one would cost the game.
 */
export function focus(
	frame: Frame,
	intent: Intent,
	context: { brief?: Brief; recaps?: readonly Recap[] } = {},
): Packet {
	const { decision, seat, view, version, refused } = frame;
	if (!decision || decision.seat !== seat || intent.seat !== seat || intent.deck.seat !== seat) {
		throw new Error("A packet needs a decision and intent for its own seat");
	}
	if (view.window.kind === "finished") throw new Error("A finished game has no decision packet");
	const phaseApplies = view.window.kind === "turn" && intent.phase.turn === view.window.turn &&
		intent.phase.phase === view.window.phase;

	// The snippet written for this window, then a note for every card this seat
	// can see. Visible rather than only offered: the note on a card is wanted
	// while holding it, not just on the turn it becomes a legal play.
	const brief = context.brief;
	const shown = [...view.table, ...view.yours, ...decision.options.map((o) => `${o.label} ${o.shows ?? ""}`)].join("\n");
	const guidance = [
		brief?.deck,
		view.window.kind === "opening" ? brief?.opening : brief?.phases[view.window.phase],
		brief?.combos,
		...Object.entries(brief?.cards ?? {})
			.filter(([card]) => shown.includes(card))
			.map(([card, note]) => `${card}: ${note}`),
	].filter((line): line is string => !!line && line.length > 0);
	// Matching the window scopes assumptions; it does not prove they still hold.
	// Richer card facts and locked effect choices await the card language.
	return {
		actor: seat, window: structuredClone(view.window), version,
		obligation: decision.question,
		committed: [],
		resources: [...view.yours],
		options: structuredClone(decision.options),
		priorities: [...(intent.deck.priorities ?? [])],
		known: [...view.table, ...view.since],
		// A pregame read on an unseen opponent is an assumption by construction,
		// so it sits with the assumptions and never with the known facts.
		assumed: [
			...Object.values(brief?.against ?? {}),
			...(phaseApplies ? [...intent.turn.hypotheses, ...intent.phase.assumptions] : []),
		],
		guidance,
		lately: [...(context.recaps ?? [])].slice(-3).map((recap) => `Turn ${recap.turn}: ${recap.line}`),
		// Widening is unwritten. Advertising a route cannot make it executable.
		routes: {},
		...(refused?.length ? { refused: [...refused] } : {}),
	};
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
