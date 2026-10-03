/**
 * The table. pi-magic owns it.
 *
 * It holds the game type, the seats, their decks and their zones, the turn
 * order, and the log of everything that happened. It does not know who answers
 * a seat, and it never asks: a seat is answered by a Player, and whether that
 * is an AI, a person, a remote agent or an MCP client changes nothing here.
 *
 * Long for this repo, and it stays one file: these shapes are the state of the
 * game, and splitting them hides which facts live together.
 *
 * design-ref/HOW-MAGIC-WORKS.md sections 1 to 3. Two guarantees matter more
 * than the shapes below. Every object is in exactly one zone. Identity changes
 * when a zone changes, so a creature that dies and returns inherits nothing.
 */

import { createHash } from "node:crypto";

import type { Format } from "./format.ts";
import { claim } from "./names.ts";
import type { Said } from "./say.ts";
import type { Change, Reason, Zone } from "./syntax.ts";
import type { Decision, Outcome, SeatId } from "./types.ts";

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
	card: string;
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
	color: "W" | "U" | "B" | "R" | "G" | "C";
	/** Cavern of Souls: "spend only on a creature spell of the chosen type". */
	spendOnly?: string;
	persists?: boolean;
};

/** The notepad. Expires on its own; nobody has to remember to erase it. */
export type Note = {
	id: string;
	kind: "modification" | "restriction" | "requirement" | "replacement" | "delayed" | "marker" | "chosen" | "link" | "cost" | "permission";
	source: ObjectId;
	sourceIncarnation: number;
	until: "end-of-turn" | "end-of-combat" | "source-leaves" | "indefinite" | string;
	/** The terms, in the card language. design-ref/SYNTAX.md. */
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
	steps: string[];
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
};

/** One committed group. Richer than a list of property writes on purpose. */
export type Receipt = {
	seq: number;
	changes: Change[];
	reason: Reason;
	/** Facts read before the group, because cards watch what a thing looked like. */
	before: Record<string, unknown>;
};

/** Every decision and its pick. design-ref/CIRCUITRY.md section 11. */
export type LedgerRow = {
	seq: number;
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
	/** Recorded, so a game replays from a seed. */
	rng: { seed: string; calls: number };
	outcome: Outcome | null;
	/** Clauses the rules could not settle. The game continues. */
	gaps: string[];
	/** The mulligan round, until it settles. Null before the hands are dealt. */
	opening: Opening | null;
};

/**
 * The mulligan round. In the table rather than beside it, so that
 * `nextDecision` stays a pure function of the table and a replay sees the
 * opening the same way a player did. docs/MULLIGAN.md.
 */
export type Opening = {
	/** This round's declarations. Cleared when the round is applied. */
	declared: Record<SeatId, "keep" | "mulligan">;
	/** Mulligans taken per seat, not counting a free first one. */
	taken: Record<SeatId, number>;
	/** Seats that have kept. 103.5: they are not asked again. */
	kept: SeatId[];
	/** Cards still owed to the bottom of a library. */
	owed: Record<SeatId, number>;
	/** Mulligans settled. What remains is 103.6. */
	done: boolean;
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
const ORDERED = new Set<Zone>(["library", "graveyard", "stack"]);

/** One zone's contents, in order where the zone has one. */
export function cardsIn(table: Table, zone: Zone, owner?: SeatId): Thing[] {
	const found = [...table.things.values()].filter(
		(t) => t.zone === zone && (owner === undefined || t.owner === owner),
	);
	return ORDERED.has(zone) ? found.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : found;
}

/** Seats still in the game, in turn order. */
export const playing = (table: Table): Seat[] => table.seats.filter((s) => !s.result);

export type Entrant = {
	/** Asked for, or absent for a generated one. Letters, digits, hyphen, 20 or fewer. */
	name?: string;
	deck: string[];
};

export function start(format: Format, entrants: Entrant[], seed: string): Table {
	if (entrants.length < format.seats.min || entrants.length > format.seats.max) {
		throw new Error(
			`${format.name} seats ${format.seats.min} to ${format.seats.max}, not ${entrants.length}`,
		);
	}

	const table: Table = {
		format,
		seats: [],
		things: new Map(),
		notes: [],
		cursor: {
			active: 0,
			steps: [...format.steps],
			priority: null,
			stepDone: false,
			turn: 1,
			passes: 0,
			clock: 0,
			began: {},
		},
		log: [],
		ledger: [],
		said: [],
		rng: { seed, calls: 0 },
		outcome: null,
		gaps: [],
		opening: null,
	};

	const taken = new Set<string>();
	entrants.forEach((entrant, id) => {
		const name = claim(entrant.name, (bound) => random(table, bound), taken);
		taken.add(name);
		table.seats.push({
			id,
			name,
			deck: entrant.deck,
			life: format.startingLife,
			pool: [],
			landsPlayed: 0,
			marks: {},
		});
		entrant.deck.forEach((card, i) => {
			table.things.set(`${id}-${i}`, {
				id: `${id}-${i}`,
				incarnation: 0,
				card,
				owner: id,
				controller: id,
				zone: "library",
				position: i,
				tapped: false,
				faceDown: false,
				counters: {},
				damage: 0,
			});
		});
	});
	table.cursor.began = Object.fromEntries(table.seats.map((s) => [s.id, 0]));

	// One group: every library shuffled before anything is looked at.
	commit(table, table.seats.map((s) => ({ do: "shuffle" as const, whose: s.id })), "game-setup");
	return table;
}

/**
 * The only way the table changes. Nothing else writes to a thing, a life
 * total, a pool or the notepad.
 *
 * One call is one event, because a group of simultaneous changes is one thing
 * cards watch for. Two creatures dying together is not two deaths.
 */
export function commit(table: Table, changes: Change[], reason: Reason): Receipt {
	// Read what a watcher may need before anything moves. After the group it
	// is gone, and a receipt that cannot say what a thing looked like is a
	// receipt no trigger can read.
	const before: Record<string, unknown> = {};
	for (const change of changes) {
		if ("what" in change) {
			const was = table.things.get(change.what);
			if (was) before[change.what] = { zone: was.zone, incarnation: was.incarnation, tapped: was.tapped };
		}
	}

	for (const change of changes) {
		switch (change.do) {
			case "move": {
				const moving = thing(table, change.what);
				const from = moving.zone;
				if (ORDERED.has(from)) {
					for (const other of cardsIn(table, from, moving.owner)) {
						if ((other.position ?? 0) > (moving.position ?? 0)) other.position = (other.position ?? 0) - 1;
					}
				}
				moving.zone = change.to;
				// Identity changes on a zone change, so every note left on the
				// old incarnation stops applying.
				moving.incarnation += 1;
				moving.tapped = false;
				moving.faceDown = false;
				moving.counters = {};
				moving.damage = 0;
				if (ORDERED.has(change.to)) {
					const zone = cardsIn(table, change.to, moving.owner);
					if (change.position === "bottom") {
						moving.position = zone.length;
					} else {
						for (const other of zone) other.position = (other.position ?? 0) + 1;
						moving.position = 0;
					}
				} else {
					delete moving.position;
				}
				table.notes = table.notes.filter(
					(note) => note.source !== moving.id || note.sourceIncarnation === moving.incarnation,
				);
				break;
			}
			case "tap":
				thing(table, change.what).tapped = true;
				break;
			case "untap":
				thing(table, change.what).tapped = false;
				break;
			case "shuffle": {
				// The shuffle is the only randomness in the game. Positions are
				// swapped so the library stays a list the engine fully knows.
				const library = cardsIn(table, "library", change.whose);
				for (let i = library.length - 1; i > 0; i--) {
					const j = random(table, i + 1);
					const a = library[i]!;
					const b = library[j]!;
					const held = a.position;
					a.position = b.position;
					b.position = held;
				}
				break;
			}
			case "change-life":
				seat(table, change.who).life += change.amount;
				break;
			case "mark-player": {
				const marked = seat(table, change.who);
				marked.marks[change.key] = (marked.marks[change.key] ?? 0) + change.add;
				break;
			}
			case "end-game": {
				seat(table, change.who).result = change.result;
				const left = playing(table);
				if (left.length === 1) left[0]!.result = "win";
				if (left.length <= 1) {
					table.outcome = {
						results: Object.fromEntries(table.seats.map((s) => [s.id, s.result ?? "draw"])),
						gaps: table.gaps,
					};
				}
				break;
			}
		}
	}

	const receipt: Receipt = { seq: table.log.length, changes, reason, before };
	table.log.push(receipt);
	table.cursor.clock += 1;
	return receipt;
}

/** Deterministic, counter based, so replay needs the seed and nothing else. */
export function random(table: Table, bound: number): number {
	const digest = createHash("sha256").update(`${table.rng.seed}:${table.rng.calls}`).digest();
	table.rng.calls += 1;
	return digest.readUInt32BE(0) % bound;
}
