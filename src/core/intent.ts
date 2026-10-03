/**
 * What a seat means to do. Core, and readable by whoever holds the seat.
 *
 * Three horizons, because one decision has to be answerable with the whole turn
 * in view. A person at a seat wants a turn objective and a phase review as much
 * as a model does, so the records live here and any kind of player may fill
 * them, write over them, or leave them empty.
 *
 * The table never reads any of this to decide legality. An intent changes which
 * option a seat prefers. It cannot make a legal option disappear, and a seat
 * that ignores its own plan is playing badly, not illegally.
 *
 * Filling these from a model is the decision context engine's job, in
 * src/context/plan.ts. Holding them is this file's.
 */

import type { SeatId, Situation } from "./types.ts";
import type { Phase as TurnPhase } from "./steps.ts";

/** Deck level. Set before the first turn, changed rarely. */
export type Policy = {
	seat: SeatId;
	/** How this deck wins, in the seat's own words. */
	winsBy?: string;
	/** What to spend and what to hold, as reasons rather than rules. */
	priorities?: string[];
	/** What would make this seat abandon the plan. */
	reconsiderWhen?: string[];
	/**
	 * Situations this seat lets the table take when one option is left, such as
	 * a draw it would always perform. Recorded as delegated, never as forced:
	 * the rules did not compel it, this seat did.
	 */
	delegates?: Situation[];
};

/** Turn level. What this turn is for, and what it will spend getting there. */
export type Turn = {
	objective: string;
	budget: string[];
	/** What this seat suspects about an opponent, kept apart from what it knows. */
	hypotheses: string[];
};

/**
 * Phase level. The order of operations and what would change it.
 *
 * A phase plan holds the reason to wait as well as the things to do now.
 * Preserving a resource for a later phase is a plan, not an absence of one.
 */
export type Phase = {
	turn: number;
	phase: TurnPhase;
	order: string[];
	expectedBranches: string[];
	reconsiderWhen: string[];
	assumptions: string[];
};

export type Intent = {
	seat: SeatId;
	deck: Policy;
	turn: Turn;
	phase: Phase;
	/** Rises when any horizon is rewritten. A packet carries it so a stale answer shows. */
	version: number;
};
