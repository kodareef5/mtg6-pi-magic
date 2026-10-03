/**
 * The game type a table runs.
 *
 * Here so that a second format is a record rather than a rewrite. Standard with
 * two seats is what the first milestone plays. Commander is next, and it
 * differs in these fields and not in the engine.
 */

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
	 * that file is a candidate, which is why adding one is a record and not
	 * code.
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
	 * Every seat hands in a deck list, so composition is public and odds are
	 * computable. False leaves an opponent's pool unknown and the odds absent.
	 */
	decksRegistered: boolean;
	/**
	 * When a seat that mulliganed puts cards on the bottom.
	 *
	 * `on-keep` is how Arena and every player does it: see the full hand,
	 * decide, then bottom. `per-mulligan` is 103.5 read literally, which bottoms
	 * as the last step of each mulligan, so the next declaration is made on a
	 * smaller hand. Both are supported because both are defensible readings and
	 * the difference is visible to a player. docs/MULLIGAN.md.
	 */
	mulliganBottom: "on-keep" | "per-mulligan";
	/** The opening turn's steps. A proposal: an effect may edit it mid walk. */
	steps: string[];
};

const TURN = [
	"untap",
	"upkeep",
	"draw",
	"precombat-main",
	"begin-combat",
	"declare-attackers",
	"declare-blockers",
	"combat-damage",
	"end-of-combat",
	"postcombat-main",
	"end",
	"cleanup",
];

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
 * Next, and unwritten. The fields above already carry 40 life, a command zone,
 * singleton decks, a seat range up to eight and its own legality column. What
 * is missing is engine work: the commander tax, damage counted per commander,
 * and a seat leaving without ending the game. So this stays absent until it is
 * real rather than half declared.
 */
