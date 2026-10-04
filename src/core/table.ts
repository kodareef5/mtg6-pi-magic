/**
 * The table. pi-magic owns it.
 *
 * It holds the game type, the seats, their decks and their zones, the turn
 * order, and the log of everything that happened. It does not know who answers
 * a seat, and it never asks: a seat is answered by a Player, and whether that
 * is an AI, a person, a remote agent or an MCP client changes nothing here.
 *
 * These shapes and the readers over them, and nothing that writes: `commit.ts`
 * is the only writer. Past 150 lines because the shapes are the state of the
 * game and splitting them hides which facts live together.
 *
 * design-ref/HOW-MAGIC-WORKS.md sections 1 to 3. Two guarantees matter more
 * than the shapes below. Every object is in exactly one zone. Identity changes
 * when a zone changes, so a creature that dies and returns inherits nothing.
 */

import type { Format } from "./format.ts";
import type { Said } from "./say.ts";
import type { Step } from "./steps.ts";
import type { Change, Reason, Zone } from "./syntax.ts";
import type { Decision, Outcome, SeatId } from "./types.ts";
import type { Workspace, WorkEntry } from "./work.ts";
import type { Instruction, Procedure } from "./work-language.ts";
import type { ObjectRef } from "./types.ts";

export type { Change, Reason, Zone } from "./syntax.ts";

export type ObjectId = string;
/**
 * One card or token.
 *
 * `incarnation` rises on every zone change, so "this existence of this card" is
 * expressible and a note left on the dead one does not apply to the returned
 * one. One exception, from 406.7: an object already in exile that becomes
 * exiled again does not change zones but does become a new object. So the
 * incarnation rises there too, and a zone change is not the only trigger.
 *
 * `position` is the real order of an ordered zone and the engine always knows
 * it. The library is a list, not a bag. The shuffle is the only randomness; a
 * draw is taking position 0 and is not random at all. A fixture that sets a
 * known library order is an ordinary edit, which is how a benchmark stacks a
 * deck, and the engine is none the wiser.
 */
export type Thing = {
	id: ObjectId;
	incarnation: number;
	/** Cards have a name. Spells and noncard stack objects hold accepted instructions. */
	card?: string;
	ability?: Activation;
	/** Accepted base characteristics, not a cached layer result. */
	creature?: { power: number; toughness: number };
	entered?: number;
	owner: SeatId;
	controller: SeatId;
	zone: Zone;
	/** Set in library, graveyard and stack, which have a top and a bottom. */
	position?: number;
	tapped: boolean;
	faceDown: boolean;
	counters: Record<string, number>;
	/** Marked damage. Not a counter. Wiped at cleanup. */
	damage: number;
};

/**
 * A single mana, not a count. One mana can carry conditions, so two green mana
 * in a pool are not always interchangeable. Pools empty at every step boundary.
 */
export type Mana = {
	id: string;
	color: "W" | "U" | "B" | "R" | "G" | "C";
	/** Cavern of Souls: "spend only on a creature spell of the chosen type". */
	spendOnly?: string;
	persists?: boolean;
};

/** One accepted announcement. Meaning and delegation are frozen at execution. */
export type Activation = {
	source: ObjectRef;
	controller: SeatId;
	claim: string;
	basis: string;
	timing: Procedure["timing"];
	spell?: Procedure["spell"];
	targetRule?: Procedure["target"];
	target?: ObjectRef | { player: SeatId };
	cost: Procedure["cost"];
	paid: string[];
	instructions: Instruction[];
	delegate: boolean;
};
/** A resolution can pause for its controller or another player, with no priority. */
export type Resolution = { object: ObjectId; instruction: number; remaining: number };

/** The notepad. Expires on its own; nobody has to remember to erase it. */
export type Note = {
	id: string;
	kind: "modification" | "restriction" | "requirement" | "replacement" | "delayed" | "marker" | "chosen" | "link" | "cost" | "permission";
	source: ObjectId;
	sourceIncarnation: number;
	until: "end-of-turn" | "end-of-combat" | "source-leaves" | "indefinite" | string;
	/** The terms, in the card language. design-ref/archive/SYNTAX.md. */
	terms: unknown;
	/** Rises with the clock, because "which of these two is newer" must have an answer. */
	written: number;
};

/**
 * A turn is a proposal, not a script. Phases and steps can be skipped, repeated
 * or inserted, so this is a list that gets walked and edited mid walk.
 */
export type Cursor = {
	active: SeatId;
	/** The remaining steps of the current turn, head first. */
	steps: Step[];
	priority: SeatId | null;
	/** Whether this step's turn-based action has been performed. */
	stepDone: boolean;
	/** Turns begun, starting at 1. */
	turn: number;
	/** Consecutive passes with nothing waiting. A phase ends by consensus. */
	passes: number;
	/** Monotonic. Also stamps notes. */
	clock: number;
	/** Which seat's turn began when, because "too new to attack" is not derivable from the turn number. */
	began: Record<SeatId, number>;
	/** Identifies an actual step visit, including a repeated step in one turn. */
	visit: number;
};

/** One committed group. Richer than a list of property writes on purpose. */
export type Receipt = {
	seq: number;
	/** Absent only in journals written before physical clocks were recorded. */
	clock?: number;
	/**
	 * Decisions answered when this group committed, counting the one that caused
	 * it. The journal's version, so a fork at version zero is a table that has
	 * been set up and asked nothing, and a fork at version n holds every group
	 * that decision n or earlier produced.
	 */
	at: number;
	changes: Change[];
	reason: Reason;
	/** Facts read before the group, because cards watch what a thing looked like. */
	before: Record<ObjectId, Thing>;
	/** Event-time visibility must not change when the object is revealed later. */
	after: Record<ObjectId, Thing>;
};

/** Every decision and its pick. design-ref/archive/CIRCUITRY.md section 11. */
export type LedgerRow = {
	seq: number;
	clock?: number;
	/** The physical action also settles this draft step, even if a later write tears. */
	execution?: { draft: string; step: number; actionId: string };
	/** A prepared physical operation, recorded so replay never infers its meaning again. */
	activation?: Activation;
	situation: Decision["situation"];
	seat: SeatId;
	offered: string[];
	picked: string;
	by: "engine" | "model" | "judge";
	/**
	 * Why it went this way, and the five stay apart because they are different
	 * claims. `forced`: the rules left no alternative. `delegated`: the seat
	 * handed this kind of step to the table. `chosen`: the seat picked it.
	 * `declared`: the seat moved the cards itself. `fallback`: no usable answer
	 * arrived, so the table took the terminating option and wrote a gap.
	 *
	 * A shortlist of one is not proof of force, so nothing writes `forced` on
	 * the strength of a short list. A fallback is not a choice and is never
	 * counted as one.
	 */
	why?: "forced" | "delegated" | "chosen" | "declared" | "fallback";
};

/**
 * One seat. Its library, hand and graveyard are its own, and it is the only
 * seat entitled to what is hidden in them. The battlefield, the stack, exile
 * and the command zone are shared, which is why a Thing carries both an owner
 * and a zone rather than sitting inside a seat.
 */
export type Seat = {
	id: SeatId;
	/**
	 * Set when the game starts. Normal play never changes it: a log that renames
	 * a seat halfway through is unreadable. A fork may rename, because a copied
	 * game may want its own names, so the engine supports it and no command
	 * offers it. docs/STATE.md.
	 */
	name: string;
	/** The deck as card names. Kept so a game replays from the seed. */
	deck: string[];
	life: number;
	pool: Mana[];
	landsPlayed: number;
	/**
	 * Counters and flags that belong to a seat rather than to a card: poison,
	 * energy, experience, and "tried to draw from an empty library", 704.5b.
	 * One bucket with a key, because they behave the same and a kind each would
	 * mean a code change per set.
	 */
	marks: Record<string, number>;
	/** Set once the game is over for this seat. */
	result?: "win" | "lose" | "draw";
};

export type Table = {
	/** The game type. One table runs one. */
	format: Format;
	/** In turn order. */
	seats: Seat[];
	things: Map<ObjectId, Thing>;
	notes: Note[];
	cursor: Cursor;
	log: Receipt[];
	ledger: LedgerRow[];
	/** Table talk. Beside the log, not in it: a message changes nothing. */
	said: Said[];
	/**
	 * Recorded, so a game replays from a seed.
	 *
	 * One counter per stream, not one counter. Naming the seats and shuffling the
	 * libraries both want randomness and are unrelated, so sharing a counter made
	 * a game with supplied names deal different cards from the same game with
	 * generated ones: the names were already known, those draws never happened,
	 * and every shuffle after them moved. A reconstruction from a journal header
	 * supplies the names, so that path was every replay.
	 */
	rng: { seed: string; calls: Record<string, number> };
	outcome: Outcome | null;
	/** Clauses the rules could not settle. The game continues. */
	gaps: string[];
	/** The mulligan round, until it settles. Null before the hands are dealt. */
	opening: Opening | null;
	/** Private seat equipment. Editing it never advances the physical clock. */
	work: Record<SeatId, Workspace>;
	workLog: WorkEntry[];
	resolution: Resolution | null;
};

/**
 * The mulligan round. In the table rather than beside it, so that
 * `nextDecision` stays a pure function of the table and a replay sees the
 * opening the same way a player did. docs/MULLIGAN.md.
 */
export type Opening = {
	/** This round's declarations. Cleared when the round is applied. */
	declared: Record<SeatId, "keep" | "mulligan">;
	/** Mulligans taken per seat, including a free first one. owedFor applies the allowance. */
	taken: Record<SeatId, number>;
	/** Seats that have kept. 103.5: they are not asked again. */
	kept: SeatId[];
	/** Cards still owed to the bottom of a library. */
	owed: Record<SeatId, number>;
};

/** Every seat by id, because the turn order is an array and lookups are not. */
export function seat(table: Table, id: SeatId): Seat {
	const found = table.seats.find((s) => s.id === id);
	if (!found) throw new Error(`No seat ${id} at this table`);
	return found;
}

/** A thing by id. Absent is a caller bug, not a condition to handle. */
export function thing(table: Table, id: ObjectId): Thing {
	const found = table.things.get(id);
	if (!found) throw new Error(`No object ${id} at this table`);
	return found;
}

/** The zones with a top and a bottom. A hand and a battlefield must not grow one. */
export const ORDERED = new Set<Zone>(["library", "graveyard", "stack"]);

/**
 * Ordered zones with one order for the whole table rather than one per seat.
 *
 * The stack is the only one. A library and a graveyard are each a seat's own, so
 * two seats can both hold a top card; the stack has a single top and whatever is
 * on it resolves in one sequence whoever cast it. Renumbering a shared zone per
 * owner gives two objects the same position and loses the order they arrived in.
 */
export const SHARED = new Set<Zone>(["stack"]);

/** The scope an ordered zone's positions are numbered within. */
export const orderedWithin = (zone: Zone, owner: SeatId): SeatId | undefined =>
	SHARED.has(zone) ? undefined : owner;

/** One zone's contents, in order where the zone has one. */
export function cardsIn(table: Table, zone: Zone, owner?: SeatId): Thing[] {
	const found = [...table.things.values()].filter(
		(t) => t.zone === zone && (owner === undefined || t.owner === owner),
	);
	return ORDERED.has(zone) ? found.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : found;
}

/** Seats still in the game, in turn order. */
export const playing = (table: Table): Seat[] => table.seats.filter((s) => !s.result);
