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
import { characteristics, forget, has, type Traits } from "./characteristics.ts";
import { terms } from "./entry.ts";
import { before as lookBack, detect } from "./triggers.ts";
import type { Universe } from "./cards.ts";
import { listed, register, type Deck } from "./decks.ts";
import { claim } from "./names.ts";
import { targetKey } from "./selectors.ts";
import type { Change, Reason, Zone } from "./syntax.ts";
import {
	type Activation,
	cardsIn,
	ORDERED,
	orderedWithin,
	playing,
	seat,
	thing,
	type Note,
	type Receipt,
	type Table,
	type Thing,
} from "./table.ts";

export type Entrant = {
	/** Asked for, or absent for a generated one. Letters, digits, hyphen, 20 or fewer. */
	name?: string;
	deck: Deck;
};

/**
 * Set a game up. Each seat's deck is registered first, against the card universe
 * and the format: a deck that does not register stops the game here. Every card
 * object in the game comes from a registered deck, its main deck into the
 * library and its sideboard outside the game. Printed facts come from the
 * pinned card file, the shipped Standard file by default.
 */
export function start(format: Format, entrants: Entrant[], seed: string, universe: Universe = shipped()): Table {
	if (entrants.length < format.seats.min || entrants.length > format.seats.max) {
		throw new Error(
			`${format.name} seats ${format.seats.min} to ${format.seats.max}, not ${entrants.length}`,
		);
	}
	const decks = entrants.map((entrant) => register(universe, entrant.deck, format));

	const table: Table = {
		format,
		printed: printedFacts(universe, decks.flatMap((deck) => [...listed(deck.main), ...listed(deck.sideboard)])),
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
		combat: null,
		waiting: [],
		rulings: [],
	};

	const taken = new Set<string>();
	entrants.forEach((entrant, id) => {
		// Its own stream, so whether a name was supplied cannot move a shuffle.
		const name = claim(entrant.name, (bound) => random(table, bound, "names"), taken);
		taken.add(name);
		table.seats.push({
			id,
			name,
			deck: decks[id]!,
			life: format.startingLife,
			pool: [],
			landsPlayed: 0,
			marks: {},
		});
		const main = listed(decks[id]!.main);
		[...main, ...listed(decks[id]!.sideboard)].forEach((card, i) => {
			table.things.set(`${id}-${i}`, {
				id: `${id}-${i}`,
				incarnation: 0,
				card,
				owner: id,
				controller: id,
				...(i < main.length ? { zone: "library" as const, position: i } : { zone: "outside" as const }),
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
	// "If it would die, exile it instead" changes the event before it happens (614.1a).
	for (const change of changes) {
		const dying = change.do === "move" && change.to === "graveyard" ? table.things.get(change.what) : undefined;
		const instead = dying?.zone === "battlefield" ? characteristics(table, dying)?.registrations.find((one) => one.kind === "replace" && one.on === "dies") : undefined;
		if (change.do === "move" && instead?.kind === "replace") change.to = instead.to as Zone;
	}
	// A fixture's setup is not a game event, and triggers nothing.
	const detecting = reason !== "game-setup";
	const prior = detecting ? lookBack(table, changes) : undefined;
	// Read what a watcher may need before anything moves. After the group it
	// is gone, and a receipt that cannot say what a thing looked like is a
	// receipt no trigger can read.
	const before: Receipt["before"] = {}, known: Record<string, Traits> = {};
	for (const change of changes) {
		if (change.do === "move") {
			const leaving = table.things.get(change.what);
			const traits = leaving?.zone === "battlefield" && change.to !== "battlefield" ? characteristics(table, leaving) : undefined;
			if (traits) known[change.what] = structuredClone(traits);
		}
		const id = "what" in change ? change.what : change.do === "damage" && "id" in change.target ? change.target.id : undefined;
		const was = id === undefined ? undefined : table.things.get(id);
		if (was) before[was.id] = structuredClone(was);
	}
	const born = new Set(changes.flatMap((change) => change.do === "token" ? [change.id] : []));
	// What triggers while a trigger is put on the stack joins the next round (603.3b).
	const putting = changes.find((change) => change.do === "trigger" && change.action === "put");
	const round = putting?.do === "trigger" ? (table.waiting.find((trigger) => trigger.id === putting.trigger)?.round ?? 0) + 1 : 0;

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
				moving.tapped = change.to === "battlefield" && !!change.tapped;
				moving.controller = change.controller ?? moving.owner;
				moving.faceDown = false;
				moving.counters = change.to === "battlefield" ? structuredClone(change.counters ?? {}) : {};
				moving.damage = 0;
				delete moving.deathtouched;
				delete moving.attached;
				if (change.to === "battlefield") moving.entered = table.cursor.clock + 1;
				else delete moving.entered;
				if (change.to === "battlefield" && change.registers?.length) moving.registrations = structuredClone(change.registers);
				else delete moving.registrations;
				if (change.to === "battlefield") enter(table, moving, change, before, born);
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
				table.notes = table.notes.filter((note) => !(("on" in note && note.on.id === moving.id) ||
					(note.until === "while-source" && note.source?.id === moving.id)));
				break;
			}
			case "tap":
				thing(table, change.what).tapped = true;
				break;
			case "untap":
				thing(table, change.what).tapped = false;
				break;
			case "add-mana":
				seat(table, change.who).pool.push(...change.colors.map((color, unit) => ({ id: `mana-${table.cursor.clock + 1}-${index}-${unit}`, color,
					...(change.spendOnly ? { spendOnly: structuredClone(change.spendOnly) } : {}) })));
				break;
			case "spend-mana":
				seat(table, change.who).pool = seat(table, change.who).pool.filter((mana) => !change.ids.includes(mana.id));
				break;
			case "damage":
				if ("player" in change.target) seat(table, change.target.player).life -= change.amount;
				else {
					const hurt = thing(table, change.target.id);
					hurt.damage += change.amount;
					// 704.5h reads this at the next check; cleanup clears it with the damage.
					if (deathtouch(table, change.source)) hurt.deathtouched = true;
				}
				break;
			case "activate":
				if (change.ability.timing === "spell") {
					const card = thing(table, change.what);
					card.ability = structuredClone(change.ability);
				} else if (change.ability.timing === "stack") stack(table, change.id, change.ability);
				break;
			case "trigger":
				if (change.action === "wait") table.waiting.push(structuredClone(change.trigger));
				else {
					table.waiting = table.waiting.filter((trigger) => trigger.id !== change.trigger);
					if (change.ability) stack(table, change.id!, change.ability);
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
			case "counters": {
				const object = thing(table, change.what);
				const count = (object.counters[change.kind] ?? 0) + change.amount;
				if (count > 0) object.counters[change.kind] = count;
				else delete object.counters[change.kind];
				break;
			}
			case "attach":
				if (change.to) thing(table, change.what).attached = structuredClone(change.to);
				else delete thing(table, change.what).attached;
				break;
			case "token": {
				const token: Thing = { id: change.id, incarnation: 0, owner: change.controller, controller: change.controller, zone: "battlefield",
					tapped: !!change.tapped, faceDown: false, counters: {}, damage: 0, entered: table.cursor.clock + 1, token: structuredClone(change.spec) };
				table.things.set(change.id, token);
				enter(table, token, change, before, born);
				break;
			}
			case "reveal":
				break;
			case "note":
				table.notes.push({ ...structuredClone(change.note), id: `note-${table.cursor.clock + 1}-${index}`, written: table.cursor.clock + 1 } as Note);
				break;
			case "cease": {
				const gone = thing(table, change.what);
				table.things.delete(gone.id);
				if (gone.zone === "stack") for (const other of cardsIn(table, "stack")) if ((other.position ?? 0) > (gone.position ?? 0)) other.position! -= 1;
				break;
			}
			case "attack":
				table.combat = { attackers: structuredClone(change.attackers), blockers: [], blocked: [], choosing: [], assigned: [] };
				// 508.8: nobody attacked, so there are no blockers and no combat damage.
				if (!change.attackers.length) table.cursor.steps = table.cursor.steps.filter((step) => step !== "declare-blockers" && step !== "combat-damage");
				break;
			case "block": {
				const combat = table.combat!;
				combat.blockers = structuredClone(change.blockers);
				combat.blocked = combat.attackers.filter((one) => change.blockers.some((blocker) => blocker.blocking.some((aimed) => aimed.id === one.id && aimed.incarnation === one.incarnation)))
					.map(({ id, incarnation }) => ({ id, incarnation }));
				combat.choosing = [];
				break;
			}
			case "combat": {
				const combat = table.combat ??= { attackers: [], blockers: [], blocked: [], choosing: [], assigned: [] };
				if (change.action === "choose") combat.choosing.push(structuredClone(change.pick));
				else if (change.action === "remove") combat.choosing = combat.choosing.filter((pick) =>
					pick.attacker.id !== change.pick.attacker.id || pick.attacker.incarnation !== change.pick.attacker.incarnation ||
					("blocker" in pick ? !("blocker" in change.pick) || pick.blocker.id !== change.pick.blocker.id || pick.blocker.incarnation !== change.pick.blocker.incarnation : "blocker" in change.pick));
				else if (change.action === "assign") combat.assigned.push(...change.division.map((part) => ({ source: structuredClone(change.source), ...structuredClone(part) })));
				else if (change.action === "strike") {
					combat.first = structuredClone(change.first);
					table.cursor.steps.splice(1, 0, "combat-damage");
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

	// What the group caused to trigger waits for the next time a player would receive priority.
	if (detecting) {
		forget(table);
		const found = detect(table, changes, { before, known }, prior);
		table.waiting.push(...found.waiting.map((trigger) => round ? { ...trigger, round } : trigger));
		if (found.spent.length) table.notes = table.notes.filter((note) => !found.spent.includes(note.id));
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
		...(Object.keys(known).length ? { known } : {}),
	};
	// The clock moves for every group, logged or not, because a note needs a
	// stamp and "which of these two is newer" must have an answer.
	table.cursor.clock += 1;
	if (control(changes)) return receipt;
	table.log.push(receipt);
	return receipt;
}

/** An ability or trigger goes on top of the stack as its own object. */
function stack(table: Table, id: string, ability: Activation): void {
	for (const object of cardsIn(table, "stack")) object.position = (object.position ?? 0) + 1;
	table.things.set(id, { id, incarnation: 0, owner: ability.controller, controller: ability.controller,
		zone: "stack", position: 0, tapped: false, faceDown: false, counters: {}, damage: 0, ability: structuredClone(ability) });
}

/** Entering terms apply as part of the motion, and the recorded change says so. */
function enter(table: Table, object: Thing, change: { tapped?: true; counters?: Record<string, number> }, before: Receipt["before"], born: ReadonlySet<string>): void {
	forget(table);
	const entering = terms(table, object, before, born);
	if (entering.tapped) object.tapped = change.tapped = true;
	for (const [kind, count] of Object.entries(entering.counters)) if (count > 0) object.counters[kind] = (object.counters[kind] ?? 0) + count;
	if (Object.keys(object.counters).length) change.counters = { ...object.counters };
}

/** Remaining instructions and choices belong to the table throughout resolution. */
function resolutionTransition(table: Table, change: Extract<Change, { do: "resolution" }>): void {
	if (change.action === "begin") {
		table.resolution = { object: change.what, source: structuredClone(change.source), program: structuredClone(change.program), bound: structuredClone(change.bound ?? {}),
			illegal: [...change.illegal], picked: [], ...(change.lost ? { lost: true } : {}), ...(change.optional ? { optional: true } : {}) };
		table.cursor.priority = null;
		return;
	}
	const pending = table.resolution!;
	if (change.action === "targets") {
		pending.illegal = [...change.illegal];
		pending.targetsChecked = true;
		const targets = table.things.get(pending.object)!.ability!.targets.flat();
		if (targets.length && targets.every((one) => pending.illegal.includes(targetKey(one)))) pending.lost = true;
		return;
	}
	if (change.accept) { delete pending.optional; return; }
	pending.targetsChecked = true;
	if (change.follow) pending.source = structuredClone(change.follow);
	if (change.pick) { pending.picked.push(structuredClone(change.pick)); return; }
	if (change.bind) Object.assign(pending.bound, structuredClone(change.bind));
	pending.program.shift();
	pending.picked = [];
	if (change.expand) pending.program.unshift(...structuredClone(change.expand));
	if (pending.program.length && !change.abort && !pending.lost) return;
	const object = table.things.get(change.what);
	if (object?.card) delete object.ability;
	else if (object) {
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
	changes.length > 0 && changes.every((change) => change.do === "turn" || change.do === "resolution" || (change.do === "combat" && change.action !== "strike"));

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
			// 514.2: after the final discard, expire effects and damage together,
			// before checking for state-based actions or waiting triggers.
			if (cursor.steps[0] === "cleanup" && cursor.stepDone) {
				for (const thing of table.things.values()) { thing.damage = 0; delete thing.deathtouched; }
				table.notes = table.notes.filter((note) => note.until !== "end-of-turn");
			}
			return;
		case "priority":
			cursor.priority = cursor.active;
			cursor.passes = 0;
			if (cursor.steps[0] === "cleanup") cursor.cleanupPriority = true;
			return;
		case "end": {
			const step = cursor.steps.shift();
			cursor.visit += 1;
			for (const s of table.seats) s.pool = s.pool.filter((mana) => mana.persists);
			if (step === "cleanup" && cursor.cleanupPriority) cursor.steps.unshift("cleanup");
			delete cursor.cleanupPriority;
			// 511.3: everything is removed from combat as the end of combat step ends.
			if (step === "end-of-combat") { table.notes = table.notes.filter((note) => note.until !== "end-of-combat"); table.combat = null; }
			// Each damage step divides afresh.
			if (step === "combat-damage" && table.combat) table.combat.assigned = [];
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
	// The first turn begins when the last hand is settled: what counts "this turn" starts there, not at seating.
	if (opening.kept.length === table.seats.length && !Object.values(opening.owed).some((count) => count > 0)) table.cursor.began[table.cursor.active] = table.cursor.clock + 1;
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

/** A source with deathtouch, read as it is now or, gone, as it last was on the battlefield. */
function deathtouch(table: Table, source: string): boolean {
	const now = table.things.get(source);
	return !!now && has(characteristics(table, now), "deathtouch");
}
