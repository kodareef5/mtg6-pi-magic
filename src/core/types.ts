/**
 * The vocabulary of a decision. Everything that crosses between the engine, a
 * player and a reader is one of these shapes.
 *
 * State lives in table.ts. Nothing here describes a card, a zone or a motion.
 */

export type SeatId = number;

/**
 * Who a view is built for. A spectator is entitled to public facts and nothing
 * else, which makes it the only view safe to publish. docs/STATE.md.
 */
export type Viewer = SeatId | "spectator";

/**
 * The seven moments somebody must decide. A decision outside this list is
 * invented. design-ref/HOW-MAGIC-WORKS.md section 5.
 */
export type Situation =
	| "priority"
	| "turn-based"
	| "resolution"
	| "trigger-order"
	| "replacement-order"
	| "state-based"
	| "pregame";

/**
 * One move the engine already built and checked. `id` is stable so a pick
 * replays. `shows` carries the arithmetic where a bare number would not be
 * checkable: "four power, the first blocker needs two because it already has
 * one marked, so two and two".
 *
 * What the move changes is not here. A player picks an id and never writes a
 * motion, an amount, a target or a cost.
 */
export type Option = {
	id: string;
	label: string;
	shows?: string;
};

/** Options are canonically ordered, so a seed plus the picks replays the game. */
export type Decision = {
	situation: Situation;
	seat: SeatId;
	question: string;
	options: Option[];
};

/**
 * What one seat may read, already in words. The engine writes these lines
 * because it is the only thing that knows which facts this seat has earned.
 * Hidden things keep their shape: "Blue has six cards in hand", never the names
 * and never silence.
 */
export type SeatView = {
	/** Public facts, one line each, same order every time so two frames diff. */
	table: string[];
	/** What only this seat knows. */
	yours: string[];
	/** What happened since this seat's last frame, as a player would say it. */
	since: string[];
};

/** What a seat is shown at one moment. A decision means it is this seat's turn. */
export type Frame = {
	seat: SeatId;
	version: number;
	view: SeatView;
	decision?: Decision;
};

export type Pick = {
	option: string;
	/** Fresh per attempt, so a repeat is answered from the record. */
	actionId: string;
};

/** `gaps` holds clauses the rules could not settle. The game still finished. */
export type Outcome = {
	results: Record<SeatId, "win" | "lose" | "draw">;
	gaps: string[];
};
