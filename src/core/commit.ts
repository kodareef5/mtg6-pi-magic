/**
 * The one door onto the table.
 *
 * Nothing else writes to a thing, a life total, a pool, the notepad or the
 * cursor. One call is one event, because a group of simultaneous changes is one
 * thing cards watch for: two creatures dying together is not two deaths.
 *
 * Past 150 lines because these share one writer: dealing a table out,
 * applying a group, turn and resolution transitions, and the seeded
 * random the shuffle draws on. Splitting them puts half of `commit` behind an
 * import of the other half, and the phase handlers that propose a transition
 * already import this file to perform it.
 */

import { createHash } from "node:crypto";

import { firstMulliganFree, type Format } from "./format.ts";
import { printedFacts, shipped } from "./printed.ts";
import type { Universe } from "./cards.ts";
import { claim } from "./names.ts";
import type { Change, Reason } from "./syntax.ts";
import {
	cardsIn,
	ORDERED,
	orderedWithin,
	playing,
	seat,
	thing,
	type Receipt,
	type Table,
} from "./table.ts";

export type Entrant = {
	/** Asked for, or absent for a generated one. Letters, digits, hyphen, 20 or fewer. */
	name?: string;
	deck: string[];
};

/** Printed facts come from the pinned card file, the shipped Standard file by default. */
export function start(format: Format, entrants: Entrant[], seed: string, universe: Universe = shipped()): Table {
	if (entrants.length < format.seats.min || entrants.length > format.seats.max) {
		throw new Error(
			`${format.name} seats ${format.seats.min} to ${format.seats.max}, not ${entrants.length}`,
		);
	}

	const table: Table = {
		format,
		printed: printedFacts(universe, entrants.flatMap((entrant) => entrant.deck)),
		seats: [],
		things: new Map(),
		notes: [],
		cursor: {
			active: 0,
			// 103.8a skips the entire first draw step, including its priority window.
			steps: format.steps.filter((step) => entrants.length !== 2 || step !== "draw"),
			priority: null,
			stepDone: false,
			turn: 1,
			passes: 0,
			clock: 0,
			began: {},
			visit: 0,
		},
		log: [],
		ledger: [],
		said: [],
		rng: { seed, calls: {} },
		outcome: null,
		gaps: [],
		opening: null,
		work: {},
		workLog: [],
		resolution: null,
	};

	const taken = new Set<string>();
	entrants.forEach((entrant, id) => {
		// Its own stream, so whether a name was supplied cannot move a shuffle.
		const name = claim(entrant.name, (bound) => random(table, bound, "names"), taken);
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
	// Refuse an unavailable or duplicated payment before an earlier tap can commit.
	// Mana added earlier in the same group, by a mana ability activated while paying, can be spent.
	const available = new Map(table.seats.map((seat) => [seat.id, new Set(seat.pool.map((mana) => mana.id))]));
	for (const [index, change] of changes.entries()) {
		if (change.do === "add-mana") change.colors.forEach((_, unit) => available.get(change.who)?.add(`mana-${table.cursor.clock + 1}-${index}-${unit}`));
		if (change.do === "spend-mana") for (const id of change.ids) {
			if (!available.get(change.who)?.delete(id)) throw new Error(`Mana ${id} is not available to spend.`);
		}
	}
	// Read what a watcher may need before anything moves. After the group it
	// is gone, and a receipt that cannot say what a thing looked like is a
	// receipt no trigger can read.
	const before: Receipt["before"] = {};
	for (const change of changes) {
		const id = "what" in change ? change.what : change.do === "damage" && "id" in change.target ? change.target.id : undefined;
		const was = id === undefined ? undefined : table.things.get(id);
		if (was) before[was.id] = structuredClone(was);
	}

	for (const [index, change] of changes.entries()) {
		switch (change.do) {
			case "turn":
				turnTransition(table, change);
				break;
			case "opening":
				openingTransition(table, change);
				break;
			case "move": {
				const moving = thing(table, change.what);
				const from = moving.zone;
				if (ORDERED.has(from)) {
					for (const other of cardsIn(table, from, orderedWithin(from, moving.owner))) {
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
				if (change.to === "battlefield") moving.entered = table.cursor.clock + 1;
				else delete moving.entered;
				if (ORDERED.has(change.to)) {
					const zone = cardsIn(table, change.to, orderedWithin(change.to, moving.owner));
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
			case "add-mana":
				seat(table, change.who).pool.push(...change.colors.map((color, unit) => ({ id: `mana-${table.cursor.clock + 1}-${index}-${unit}`, color })));
				break;
			case "spend-mana":
				seat(table, change.who).pool = seat(table, change.who).pool.filter((mana) => !change.ids.includes(mana.id));
				break;
			case "damage":
				if ("player" in change.target) seat(table, change.target.player).life -= change.amount;
				else thing(table, change.target.id).damage += change.amount;
				break;
			case "activate":
				if (change.ability.timing === "spell") {
					const card = thing(table, change.what);
					card.ability = structuredClone(change.ability);
				} else if (change.ability.timing === "stack") {
					for (const object of cardsIn(table, "stack")) object.position = (object.position ?? 0) + 1;
					table.things.set(change.id, { id: change.id, incarnation: 0, owner: change.ability.controller, controller: change.ability.controller,
						zone: "stack", position: 0, tapped: false, faceDown: false, counters: {}, damage: 0, ability: structuredClone(change.ability) });
				}
				break;
			case "resolution":
				resolutionTransition(table, change);
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
				break;
			}
		}
	}

	// Determine the outcome after every simultaneous change has happened.
	if (changes.some((change) => change.do === "end-game")) {
		const left = playing(table);
		const winner = table.seats.find((s) => s.result === "win");
		const draw = table.seats.some((s) => s.result === "draw") || (!winner && !left.length);
		if (winner) for (const s of left) s.result = "lose";
		else if (draw) for (const s of table.seats) s.result = "draw";
		else if (left.length === 1) left[0]!.result = "win";
		if (table.seats.every((s) => s.result)) {
			table.outcome = {
				results: Object.fromEntries(table.seats.map((s) => [s.id, s.result!])),
				gaps: table.gaps,
			};
		}
	}

	// Removed objects, including resolved abilities, have no after snapshot.
	// Narration can use the event-time facts from before the group.
	const after: Receipt["after"] = {};
	for (const id of Object.keys(before)) {
		const now = table.things.get(id);
		if (now) after[id] = structuredClone(now);
	}

	const receipt: Receipt = {
		seq: table.log.length,
		clock: table.cursor.clock + 1,
		at: table.ledger.length,
		changes: structuredClone(changes),
		reason,
		before,
		after,
	};
	// The clock moves for every group, logged or not, because a note needs a
	// stamp and "which of these two is newer" must have an answer.
	table.cursor.clock += 1;
	if (control(changes)) return receipt;
	table.log.push(receipt);
	return receipt;
}

/** Remaining instructions and choices belong to the table throughout resolution. */
function resolutionTransition(table: Table, change: Extract<Change, { do: "resolution" }>): void {
	const object = thing(table, change.what);
	const instructions = object.ability!.instructions;
	if (change.action === "begin") {
		const first = instructions[0]!;
		table.resolution = { object: object.id, instruction: 0, remaining: first && "count" in first ? first.count : 1, ...(change.lost ? { lost: true } : {}) };
		table.cursor.priority = null;
		return;
	}
	const pending = table.resolution!;
	if (!change.skip && --pending.remaining > 0) return;
	pending.instruction += 1;
	const next = instructions[pending.instruction];
	if (next && !change.abort) { pending.remaining = "count" in next ? next.count : 1; return; }
	if (object.card) delete object.ability;
	else {
		table.things.delete(object.id);
		for (const other of cardsIn(table, "stack")) if ((other.position ?? 0) > (object.position ?? 0)) other.position! -= 1;
	}
	table.resolution = null;
	// Leave a checkpoint. The dispatcher checks state before advance grants priority.
	table.cursor.priority = null;
	table.cursor.passes = 0;
}

/**
 * A group that only moves the cursor is not an event.
 *
 * No card watches a priority grant or a step ending, and `advance` rebuilds
 * every one of them from the recorded picks, so logging them puts nothing in
 * the journal that a replay does not already know. Measured on a game of basic
 * lands: 5894 receipts become 220, and 754KB of journal becomes 107KB, which
 * over ten thousand benchmark games is 1.1GB rather than 7.5GB.
 *
 * The transition still goes through this door, so the cursor still has one
 * writer. It is the logging that stops, not the discipline.
 */
const control = (changes: Change[]): boolean =>
	changes.length > 0 && changes.every((change) => change.do === "turn" || change.do === "resolution");

/**
 * Who may act next, and where the turn is. A transition shares the commit door
 * with card motion so the cursor has one writer, and rides on the receipt of
 * the action that caused it when there is one.
 */
function turnTransition(table: Table, change: Extract<Change, { do: "turn" }>): void {
	const cursor = table.cursor;
	switch (change.action) {
		case "pass": {
			cursor.passes += 1;
			const order = playing(table);
			const at = order.findIndex((s) => s.id === change.who);
			cursor.priority = order[(at + 1) % order.length]?.id ?? null;
			return;
		}
		case "act":
			cursor.passes = 0;
			cursor.priority = change.who;
			if (change.land) seat(table, change.who).landsPlayed += 1;
			return;
		case "complete":
			cursor.stepDone = cursor.steps[0] !== "cleanup" ||
				cardsIn(table, "hand", cursor.active).length <= table.format.maxHandSize;
			return;
		case "priority":
			cursor.priority = cursor.active;
			cursor.passes = 0;
			return;
		case "end": {
			const step = cursor.steps.shift();
			cursor.visit += 1;
			for (const s of table.seats) s.pool = s.pool.filter((mana) => mana.persists);
			if (step === "cleanup") {
				for (const thing of table.things.values()) thing.damage = 0;
				table.notes = table.notes.filter((note) => note.until !== "end-of-turn");
			}
			if (step === "end-of-combat") table.notes = table.notes.filter((note) => note.until !== "end-of-combat");
			cursor.stepDone = false;
			cursor.priority = null;
			cursor.passes = 0;
			if (!cursor.steps.length) {
				const order = playing(table);
				const at = order.findIndex((s) => s.id === cursor.active);
				cursor.active = order[(at + 1) % order.length]?.id ?? cursor.active;
				cursor.steps = [...table.format.steps];
				cursor.turn += 1;
				cursor.began[cursor.active] = cursor.clock;
				for (const s of table.seats) s.landsPlayed = 0;
			}
		}
	}
}

function openingTransition(table: Table, change: Extract<Change, { do: "opening" }>): void {
	if (change.action === "begin") {
		table.opening = { declared: {}, taken: {}, kept: [], owed: {} };
		return;
	}
	const opening = table.opening!;
	if (change.action === "declare") opening.declared[change.who] = change.choice;
	if (change.action === "bottom") {
		const owes = opening.owed[change.who]! - 1;
		if (owes > 0) opening.owed[change.who] = owes;
		else delete opening.owed[change.who];
	}
	if (change.action === "round") {
		const free = firstMulliganFree(table.format, table.seats.length) ? 1 : 0;
		for (const s of table.seats) {
			const declaration = opening.declared[s.id];
			if (declaration === "mulligan") opening.taken[s.id] = (opening.taken[s.id] ?? 0) + 1;
			if (declaration === "keep") opening.kept.push(s.id);
			const owes = Math.max(0, (opening.taken[s.id] ?? 0) - free);
			const bottomNow = table.format.mulliganBottom === "on-keep" ? declaration === "keep" : declaration === "mulligan";
			if (bottomNow && owes > 0) opening.owed[s.id] = owes;
		}
		opening.declared = {};
	}
}

/**
 * Deterministic, counter based, so replay needs the seed and nothing else.
 *
 * One counter per named stream. Draws from one stream cannot move another, which
 * is what lets a game reconstructed with its recorded seat names deal the cards
 * the original game dealt.
 */
export function random(table: Table, bound: number, stream = "play"): number {
	const n = table.rng.calls[stream] ?? 0;
	const digest = createHash("sha256").update(`${table.rng.seed}:${stream}:${n}`).digest();
	table.rng.calls[stream] = n + 1;
	return digest.readUInt32BE(0) % bound;
}
