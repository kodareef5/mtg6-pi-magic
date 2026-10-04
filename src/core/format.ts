/**
 * The game type a table runs.
 *
 * Standard with two seats is the current target. These fields describe format
 * setup; wider formats still need their gameplay rules implemented.
 */

import { TURN, type Step } from "./steps.ts";

export type Format = {
	name: string;
	seats: { min: number; max: number };
	startingLife: number;
	startingHand: number;
	maxHandSize: number;
	/** One copy of each card outside basic lands. */
	singleton: boolean;
	/**
	 * The column in the card universe that decides legality. Every format in
	 * that file is a candidate for deck checking, not proof of gameplay support.
	 */
	legality: string;
	deck: { minSize: number; maxCopies: number };
	/** Commander, and anything else that starts outside the library. */
	commandZone: boolean;
	/**
	 * 103.5c gives a free first mulligan in any multiplayer game and in any
	 * Brawl game. Seat count answers the first half at the table, so this is
	 * the only part a format has to say.
	 */
	brawl?: boolean;
	/**
	 * Public deck names and counts, without hidden object ids or library order.
	 * Standard defaults to true. A closed-list game option can wait for v2;
	 * odds arithmetic is unfinished.
	 */
	decksRegistered: boolean;
	/**
	 * When a seat that mulliganed puts cards on the bottom.
	 *
	 * `on-keep` shows the full hand at declaration and bottoms after keeping.
	 * `per-mulligan` bottoms after each redraw, so the next declaration sees a
	 * smaller hand. Both paths are tested; see docs/MULLIGAN.md.
	 */
	mulliganBottom: "on-keep" | "per-mulligan";
	/** The opening turn's steps. A proposal: an effect may edit it mid walk. */
	steps: Step[];
};

/** 103.5c. The first mulligan costs no card in a multiplayer or Brawl game. */
export const firstMulliganFree = (format: Format, seats: number) =>
	seats > 2 || format.brawl === true;

/** 103.5. Mulligans run until the opening hand would be zero cards. */
export const mulliganLimit = (format: Format, seats: number) =>
	format.startingHand + (firstMulliganFree(format, seats) ? 1 : 0);

export const standard: Format = {
	name: "standard",
	seats: { min: 2, max: 2 },
	startingLife: 20,
	startingHand: 7,
	maxHandSize: 7,
	singleton: false,
	legality: "standard",
	deck: { minSize: 60, maxCopies: 4 },
	mulliganBottom: "on-keep",
	commandZone: false,
	decksRegistered: true,
	steps: TURN,
};

/**
 * Commander remains unwritten. The fields above already carry 40 life, a command zone,
 * singleton decks, a seat range up to eight and its own legality column. What
 * is missing is engine work: the commander tax, damage counted per commander,
 * and a seat leaving without ending the game. So this stays absent until it is
 * real rather than half declared.
 */
