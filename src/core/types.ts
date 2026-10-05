/**
 * The vocabulary of a decision. Everything that crosses between the engine, a
 * player and a reader is one of these shapes.
 *
 * State lives in table.ts. Nothing here describes a card, a zone or a motion.
 */

import type { Phase, Step } from "./steps.ts";
import type { SeenObject, Workspace } from "./work.ts";
import type { Combat, Mana, Note, Resolution } from "./table.ts";
import type { Happened } from "./selectors.ts";
import type { Printed } from "./printed.ts";
import type { PlanOption } from "./language.ts";

export type SeatId = number;
export type ObjectRef = { id: string; incarnation: number };

/** Derived from the table when projecting. An opening is not an untap step. */
export type Window =
	| { kind: "opening"; action: "deal" | "declare" | "redraw" | "bottom" }
	| { kind: "turn"; turn: number; active: SeatId; phase: Phase; step: Step }
	| { kind: "finished" };

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
 * One offered choice. Stable ids let a pick replay; shows explains the source,
 * cost and effect without requiring a reader to decode the id. Listing checks
 * resources and visibility, not whether a card permits a prepared procedure.
 * Executable changes stay in core, outside the classifier's option list.
 */
export type Option = {
	id: string;
	label: string;
	shows?: string;
	/** Visible objects this option binds. Ids are opaque; consumers never parse them. */
	objects?: ObjectRef[];
};

/** Options are canonically ordered, so a seed plus the picks replays the game. */
export type Decision = {
	situation: Situation;
	seat: SeatId;
	question: string;
	options: Option[];
	/** An offered option that safely ends this decision after two unusable answers. */
	fallback?: string;
	/** Accepted permission for a unique effect continuation, never rules force. */
	delegated?: boolean;
};

/**
 * What one seat may read, already in words. The engine writes these lines
 * because it is the only thing that knows which facts this seat has earned.
 * Hidden things keep their shape: "Blue has six cards in hand", never the names
 * and never silence.
 */
export type SeatView = {
	/** This seat's opening obligation and the public starting seat, without hidden hands. */
	opening?: { starting: SeatId; mulligans: number; bottom: number };
	/** This viewer's most recent turn start, for tap-cost availability. */
	began?: number;
	/** The rules draw in this viewer's current turn, derived from its ledger row. */
	drawnAt?: number;
	/** Lands this viewer has played this turn. */
	landsPlayed?: number;
	/** Printed facts for the names of visible objects. Public, from the pinned card file. */
	printed?: Record<string, Printed>;
	window: Window;
	/** Public facts, one line each, same order every time so two frames diff. */
	table: string[];
	/** What only this seat knows. */
	yours: string[];
	/** What happened since this seat's last frame, as a player would say it. */
	since: string[];
	/** Visible objects only; unknown public identities have no card field. */
	objects?: SeenObject[];
	/** Registered composition is public. Counts carry no object ids or hidden order. */
	decks?: { seat: SeatId; name: string; cards: Record<string, number>; sideboard: Record<string, number> }[];
	/** Actual step visit. A repeated combat is a new scheduling opportunity. */
	visit?: number;
	/** Only this seat's equipment. A spectator receives none. */
	work?: Workspace;
	/** The steps of this seat's current plan its actions have carried out, read from the ledger. */
	done?: number[];
	/** Mana is public. Stable ids distinguish individual units in a payment. */
	pools?: { seat: SeatId; mana: Mana[] }[];
	/** The remaining instruction cursor, without any hidden library identities. */
	resolution?: Resolution;
	/** Seats still playing and their life. */
	/**
	 * The other seats' recorded actions since this seat's plan was accepted, by
	 * ledger row, in public words: what an objection names.
	 */
	actions?: { row: number; seat: SeatId; what: string[]; turnDraw?: true }[];
	/** This seat's own plan steps and branches carried out this game, the latest ten distinct, with their syntax: what worked, to reuse. */
	worked?: { label: string; action: PlanOption["action"] }[];
	/** Life, and how many cards each hand and library holds: public, though the cards are not (402.3, 401.2). */
	players?: { id: SeatId; life: number; hand?: number; library?: number }[];
	/** The public notepad: labels, registrations added after entry, links, permissions. */
	notes?: Note[];
	combat?: Combat | null;
	/** This turn's public events that cards count. */
	history?: Happened[];
};

/** What a seat is shown at one moment. A decision means it is this seat's turn. */
export type Frame = {
	seat: SeatId;
	/**
	 * The table's revision: committed groups so far. A pick carries it back and a
	 * host refuses one that does not match, so an answer written against an
	 * earlier state cannot settle a later one.
	 *
	 * Not the receipt count, because a pass commits and moves no cards. Not the
	 * decision count either, because a concession, a declared motion or a judge
	 * repair changes the table without answering a decision, and a token that
	 * misses those accepts a pick written before them.
	 */
	version: number;
	view: SeatView;
	decision?: Decision;
	/**
	 * Why the answers already sent for this decision were not taken. Present
	 * only on a retry, and the decision is unchanged: the table is not asking
	 * something new, it is saying what came back and why.
	 */
	refused?: string[];
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
