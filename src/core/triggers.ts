/**
 * Triggered abilities (603). After every group, the table reads what happened
 * and matches it against the watches its permanents registered and the delayed
 * triggers on the notepad. A match waits on the table until a player would next
 * receive priority; then each seat, active player first, puts its waiting
 * triggers on the stack one at a time and chooses their targets.
 *
 * Detection is part of `commit`, so it replays with the group that caused it.
 * Leaves-the-battlefield watches look back to the moment before the group
 * (603.10a); every other watch reads the table after it (603.6).
 * Past 150 lines to keep detection beside the trigger window that empties it.
 */
import { targetChoiceKey } from "./targeting.ts";
import { characteristics, walk, type Traits } from "./characteristics.ts";
import { doubleFaced } from "./faces.ts";
import { aiming, summary, targetings } from "./announce.ts";
import { damageSource, happened, holds, matches, players, tableWorld, targetKey, viewWorld, type Scope, type Seen, type World } from "./selectors.ts";
import { playing, type Ability, type Table, type Thing, type Trigger } from "./table.ts";
import type { Pending, Move } from "./moves.ts";
import type { GameEvent, Registration } from "./language.ts";
import type { Change, Zone } from "./syntax.ts";
import type { Frame, ObjectRef, SeatId } from "./types.ts";
import type { Step } from "./steps.ts";
import { speedTrigger } from "./speed.ts";
import { casting } from "./casting.ts";

/** One thing that happened in a group, as a watch reads it. */
type Occurrence = {
	on: GameEvent["on"];
	keyword?: "scry" | "surveil" | "manifest-dread";
	ordinal?: number;
	/** What it happened to, as it was then. */
	object?: Seen;
	traits?: Traits;
	/** The object an effect finds afterwards: the card in the graveyard it went to (400.7). */
	found?: ObjectRef;
	/** `attacked-with`: every attacker. */
	objects?: { object: Seen; traits?: Traits }[];
	/** Who cast, attacked, targeted, or dealt the damage: what `by` reads. */
	player?: SeatId;
	/** The player combat damage was dealt to: "that player" on the trigger. */
	dealt?: SeatId;
	/** The targeting spell or ability, or the damage source. */
	source?: Seen;
	recipient?: Seen;
	recipientTraits?: Traits;
	amount?: number;
	combat?: boolean;
	from?: Zone;
	to?: Zone;
	step?: Step;
	whose?: SeatId;
	toPlayer?: true;
	lookBack?: true;
	face?: 0 | 1;
	fully?: true;
	counter?: string;
	beforeCount?: number;
	afterCount?: number;
};

const ref = (object: Pick<Seen, "id" | "incarnation">): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
const PUBLIC = new Set<Zone>(["battlefield", "graveyard", "stack", "exile", "command"]);

/**
 * The table as it stood before a group: what a leaves-the-battlefield watch
 * reads. Taken only when a group moves something off the battlefield.
 */
export function before(table: Table, changes: Change[]): World | undefined {
	if (!changes.some((change) => change.do === "move" && table.things.get(change.what)?.zone === "battlefield" && change.to !== "battlefield")) return undefined;
	const traits = walk(table), objects = [...table.things.values()].map((one) => ({ ...one, counters: { ...one.counters } }));
	const world = tableWorld(table), history = world.history;
	return {
		objects, read: (object) => object.zone === "battlefield" ? traits.get(object.id) : world.read(object),
		players: world.players.map((one) => ({ ...one })), notes: [...table.notes], combat: structuredClone(table.combat), history, ...(world.turn ? { turn: world.turn } : {}),
		lastKnown: (wanted) => { if (!wanted) return undefined; const object = objects.find((one) => one.id === wanted.id && one.incarnation === wanted.incarnation); return object ? { object, traits: traits.get(object.id) } : undefined; },
	};
}

/** What one group did that a watch can see. */
function occurrences(table: Table, changes: Change[], receipt: { before: Record<string, Thing>; known: Record<string, Traits> }): Occurrence[] {
	const found: Occurrence[] = [];
	const castCounts = new Map<SeatId, number>();
	const castOrdinal = (who: SeatId) => {
		const next = (castCounts.get(who) ?? happened(table).filter(one => one.kind === "cast" && one.by === who).length) + 1;
		castCounts.set(who, next); return next;
	};
	const now = (id: string) => table.things.get(id);
	const counts = new Map<string, Record<string, number>>();
	const counters = (id: string, changes: Record<string, number>, entering = false) => {
		const object = now(id);
		const previous = entering ? {} : counts.get(id) ?? { ...receipt.before[id]?.counters };
		counts.set(id, previous);
		for (const [counter, added] of Object.entries(changes)) {
			const beforeCount = previous[counter] ?? 0, afterCount = Math.max(0, beforeCount + added);
			previous[counter] = afterCount;
			if (added > 0 && object?.zone === "battlefield") found.push({ on: "counters", object, traits: characteristics(table, object), found: ref(object),
				counter, beforeCount, afterCount, amount: added });
		}
	};
	for (const change of changes) {
		switch (change.do) {
			case "keyword":
				if (change.count > 0) found.push({ on: "keyword", keyword: change.name, player: change.who, amount: change.count });
				break;
			case "move": {
				const was = receipt.before[change.what], is = now(change.what);
				if (!was || !is || was.incarnation === is.incarnation) break;
				if (change.to === "battlefield") {
					found.push({ on: "enters", object: is, traits: characteristics(table, is), found: ref(is), from: was.zone, to: "battlefield" });
					counters(is.id, change.counters ?? {}, true);
					for (const face of is.doors ?? []) found.push({ on: "unlocks", object: is, traits: characteristics(table, is), found: ref(is), face, player: is.controller });
				}
				if (was.zone === "battlefield" && is.zone !== "battlefield") {
					const left: Occurrence = { on: "leaves", object: was, traits: receipt.known[was.id], found: PUBLIC.has(is.zone) ? ref(is) : ref(was), from: "battlefield", to: is.zone, lookBack: true };
					found.push(left);
					// 700.4: dies means put into a graveyard from the battlefield.
					if (is.zone === "graveyard") found.push({ ...left, on: "dies" });
				}
				break;
			}
			case "transform": {
				const object = now(change.what), was = receipt.before[change.what];
				if (object && was && object.transformed !== was.transformed) found.push({ on: "transforms", object, traits: characteristics(table, object), found: ref(object), face: object.face, player: object.controller });
				break;
			}
			case "door": {
				const object = now(change.what), was = receipt.before[change.what];
				if (object && was && change.unlocked && !was.doors?.includes(change.face) && object.doors?.includes(change.face))
					found.push({ on: "unlocks", object, traits: characteristics(table, object), found: ref(object), face: change.face, player: object.controller,
						...(object.doors.length === 2 ? { fully: true } : {}) });
				break;
			}
			case "token": {
				const is = now(change.id);
				if (is) found.push({ on: "enters", object: is, traits: characteristics(table, is), found: ref(is), to: "battlefield" });
				counters(change.id, change.counters ?? {}, true);
				break;
			}
			case "counters":
				counters(change.what, { [change.kind]: change.amount });
				break;
			case "activate": case "trigger": {
				const ability = change.do === "activate" ? change.ability : change.action === "put" ? change.ability : undefined;
				const id = change.do === "activate" ? (ability?.timing === "spell" ? change.what : change.id) : change.action === "put" ? change.id : undefined;
				const spell = id ? now(id) : undefined;
				if (!ability || !spell || ability.timing === "mana") break;
				// Cast from the zone the card was in before the group moved it to the stack (601.2a).
				const from = receipt.before[spell.id]?.zone;
				if (change.do === "activate" && ability.timing === "spell") found.push({ on: "cast", ordinal: castOrdinal(ability.controller), object: spell, traits: characteristics(table, spell), found: ref(spell), player: ability.controller, ...(from && from !== "stack" ? { from } : {}) });
				for (const chosen of ability.targets.flat()) {
					const aimed = "id" in chosen ? now(chosen.id) : undefined;
					if (aimed && "id" in chosen && aimed.incarnation === chosen.incarnation) found.push({ on: "targeted", object: aimed, traits: characteristics(table, aimed), found: ref(aimed), player: ability.controller, source: spell });
				}
				break;
			}
			case "attack": {
				const attackers = change.attackers.flatMap((one) => { const object = now(one.id); return object ? [{ object, traits: characteristics(table, object) }] : []; });
				for (const one of attackers) found.push({ on: "attacks", object: one.object, traits: one.traits, found: ref(one.object), player: table.cursor.active });
				if (attackers.length) found.push({ on: "attacked-with", objects: attackers, player: table.cursor.active });
				break;
			}
			case "block":
				for (const one of change.blockers) {
					const object = now(one.id);
					if (object) found.push({ on: "blocks", object, traits: characteristics(table, object), found: ref(object), player: object.controller });
				}
				break;
			case "damage": {
				if (change.amount <= 0) break;
				const id = typeof change.source === "string" ? change.source : change.source.id;
				const saved = receipt.before[id], prior = saved && (typeof change.source === "string" || saved.incarnation === change.source.incarnation) ? saved : undefined;
				const source = prior ?? damageSource(table, change.source)?.object;
				const recipient = "id" in change.target ? receipt.before[change.target.id] : undefined;
				const occurrence: Occurrence = { on: "damage", ...(source ? { object: source, traits: receipt.known[id] ?? characteristics(table, source as Thing), found: ref(source), source, player: source.controller } : {}),
					...(recipient ? { recipient, recipientTraits: receipt.known[recipient.id] ?? characteristics(table, recipient) } : {}), amount: change.amount, combat: !!change.combat,
					...("player" in change.target ? { dealt: change.target.player, toPlayer: true as const } : {}) };
				found.push(occurrence);
				// Existing accepted watches retain their combat-only spelling.
				if (change.combat) found.push({ ...occurrence, on: "combat-damage" });
				break;
			}
			case "turn":
				if (change.action === "end" && table.cursor.steps[0]) found.push({ on: "step", step: table.cursor.steps[0], whose: table.cursor.active });
				break;
		}
	}
	return found;
}

/** Whether an occurrence is the event a registration names, read from the watcher's side. */
function fits(scope: Scope, event: GameEvent, occurrence: Occurrence): Occurrence | null {
	if (event.on !== occurrence.on) return null;
	if (event.keyword !== undefined && event.keyword !== occurrence.keyword) return null;
	if (event.ordinal !== undefined && event.ordinal !== occurrence.ordinal) return null;
	if (event.counter !== undefined && event.counter !== occurrence.counter) return null;
	if (event.reaches !== undefined && !(occurrence.beforeCount !== undefined && occurrence.beforeCount < event.reaches && occurrence.afterCount! >= event.reaches)) return null;
	if (event.combat !== undefined && event.combat !== occurrence.combat) return null;
	if (event.received) occurrence = { ...occurrence, object: occurrence.recipient, traits: occurrence.recipientTraits, found: occurrence.recipient ? ref(occurrence.recipient) : undefined };
	if (event.face !== undefined && event.face !== occurrence.face || event.fully && !occurrence.fully) return null;
	const side = (ref: string | undefined, seat?: SeatId) => ref === undefined || ref === "any" || (seat !== undefined && players(scope, ref).includes(seat));
	if (!side(event.by, occurrence.player) || !side(event.whose, occurrence.whose)) return null;
	if (event.step && event.step !== occurrence.step) return null;
	if (event.from && !(occurrence.from && event.from.includes(occurrence.from as never))) return null;
	if (event.to && !(occurrence.to && event.to.includes(occurrence.to as never))) return null;
	if (event.player && !occurrence.toPlayer) return null;
	if (typeof event.player === "string" && !side(event.player, occurrence.dealt)) return null;
	if (occurrence.objects) {
		const matching = occurrence.objects.filter((one) => !event.of || matches(scope, one.object, event.of, one.traits));
		return matching.length ? { ...occurrence, objects: matching } : null;
	}
	if (event.of && !(occurrence.object && matches(scope, occurrence.object, event.of, occurrence.traits))) return null;
	return occurrence;
}

/** The event refs a trigger keeps: what it happened to, who did it, and what did it. */
function eventOf(occurrences: Occurrence[]): Trigger["event"] {
	const first = occurrences[0]!;
	const objects = [...new Map(occurrences.flatMap((one) => one.objects ? one.objects.map((each) => ref(each.object)) : one.found ? [one.found] : [])
		.map((one) => [targetKey(one), one])).values()];
	const common = (key: "source" | "recipient") => first[key] && occurrences.every((one) => one[key]?.id === first[key]!.id && one[key]?.incarnation === first[key]!.incarnation) ? ref(first[key]!) : undefined;
	const source = common("source"), recipient = common("recipient");
	const actor = (one: Occurrence) => one.on === "keyword" ? one.player : one.amount !== undefined ? one.dealt : one.dealt ?? one.player;
	const player = actor(first);
	const object = first.amount !== undefined ? objects.length === 1 ? objects[0] : undefined : first.found ?? objects[0];
	return { ...(object ? { object } : {}), ...(objects.length ? { objects } : {}),
		...(player !== undefined && occurrences.every((one) => actor(one) === player) ? { player } : {}), ...(source ? { source } : {}), ...(recipient ? { recipient } : {}),
		...(first.amount !== undefined ? { amount: occurrences.reduce((sum, one) => sum + (one.amount ?? 0), 0) } : {}) };
}

/** A damage event has one occurrence per source, or per recipient when the watch reads damage received. */
function groups(event: GameEvent, matched: Occurrence[]): Occurrence[][] {
	if (event.batch) return [matched];
	// A counter watch fires for each counter; an Nth-counter watch fires once on crossing (122.7).
	if (event.on === "counters") return matched.flatMap((one) => Array.from({ length: event.reaches === undefined ? one.amount! : 1 }, () => [{ ...one, amount: event.reaches === undefined ? 1 : one.amount }]));
	if (event.on !== "damage") return matched.map((one) => [one]);
	const groups = new Map<string, Occurrence[]>();
	for (const one of matched) {
		const object = event.received ? one.recipient : one.source;
		const key = object ? targetKey(ref(object)) : `seat-${one.dealt}`;
		groups.set(key, [...(groups.get(key) ?? []), one]);
	}
	return [...groups.values()];
}

/** 603.2h: declining or losing targets does not use the effect; a use persists even after its source leaves. */
export function usedThisTurn(table: Table, source: ObjectRef | undefined, basis: string, by: SeatId): boolean {
	if (!source) return false;
	return table.log.some((receipt) => receipt.turn === table.cursor.turn && receipt.changes.some((change) => {
		const use = change.do === "resolution" && change.action === "next" ? change.use : undefined;
		return use?.source.id === source.id && use.source.incarnation === source.incarnation && use.basis === basis && use.by === by;
	}));
}

/** Whether this ability already triggered this turn, for "only once each turn". */
function triggeredThisTurn(table: Table, source: ObjectRef | undefined, basis: string, also: Trigger[], controller?: SeatId): boolean {
	// What triggered this turn: still waiting, or put on the stack, or removed from it for want of a target (603.3d).
	const same = (trigger: Pick<Trigger, "source" | "basis" | "turn"> & { controller?: SeatId }) =>
		(source ? trigger.source?.id === source.id && trigger.source.incarnation === source.incarnation : !trigger.source && trigger.controller === controller) &&
		trigger.basis === basis && (trigger.turn ?? table.cursor.turn) === table.cursor.turn;
	if ([...table.waiting, ...also].some(same)) return true;
	const began = table.cursor.began[table.cursor.active] ?? 0;
	return table.log.some((receipt) => (receipt.clock ?? 0) > began && receipt.changes.some((change) => change.do === "trigger" && change.action === "wait" ? same(change.trigger) :
		change.do === "trigger" && change.action === "put" && (change.was ? same(change.was) : !!change.ability && same({ source: change.ability.source, basis: change.ability.basis, controller: change.ability.controller }))));
}

/** What a put change keeps of the trigger, so a once-each-turn count can read it back. */
const triggered = (trigger: Trigger): Pick<Trigger, "source" | "basis" | "turn"> & { controller?: SeatId } => ({ ...(trigger.source ? { source: trigger.source } : { controller: trigger.controller }), basis: trigger.basis, ...(trigger.turn !== undefined ? { turn: trigger.turn } : {}) });

/** A watcher: a permanent's watch or suppression, read on one side of the group. */
type Watch = { object: Seen; controller: SeatId; registration: Registration; world: World };

function watches(world: World, objects: Seen[]): Watch[] {
	return objects.filter((object) => object.zone === "battlefield").flatMap((object) => (world.read(object)?.registrations ?? [])
		.filter((registration) => registration.kind === "watch" || registration.kind === "suppress")
		.map((registration) => ({ object, controller: object.controller, registration, world })));
}

/** Read extra instances from the same side of the event as the triggering ability. */
export function additionalTriggers(world: World, object: Seen): number {
	return world.objects.filter(source => source.zone === "battlefield").reduce((sum, source) => sum +
		(world.read(source)?.registrations ?? []).reduce((count, rule) => count + (rule.kind === "trigger-rule" &&
			matches({ world, source, controller: source.controller }, object, rule.affects) ? rule.additional : 0), 0), 0);
}

/** Registered watches on visible permanents now. A card in hand supplies none; this predicts no future event. */
export function activeWatches(frame: Frame) {
	const world = viewWorld(frame.view);
	return watches(world, world.objects).flatMap(({ object, controller, registration }) => registration.kind === "watch" ? [{
		source: { ...ref(object), name: object.card ?? object.token?.name ?? "unknown", controller },
		basis: registration.basis, event: structuredClone(registration.event),
		...(registration.event.of ? { matchingNow: world.objects.filter((candidate) => matches({ world, controller, source: object }, candidate, registration.event.of!))
			.map((candidate) => ({ ...ref(candidate), name: candidate.card ?? candidate.token?.name ?? "unknown" })) } : {}),
		...(registration.if ? { if: structuredClone(registration.if) } : {}),
	}] : []);
}

/**
 * The triggers one group causes, in the order their watches were found, and the
 * once-only delayed triggers it used up. `prior` is the world before the group.
 */
export function detect(table: Table, changes: Change[], receipt: { before: Record<string, Thing>; known: Record<string, Traits> }, prior?: World): { waiting: Trigger[]; spent: string[] } {
	const happened = occurrences(table, changes, receipt);
	const speed = speedTrigger(table, changes);
	if (!happened.length && !speed) return { waiting: [], spent: [] };
	const after = tableWorld(table);
	// Watches inspect the group before its receipt is appended, including its new casts and resolved entries.
	const pending = { ...receipt, changes, after: Object.fromEntries([...table.things]) };
	after.casting = (ref) => casting(table, ref, pending);
	const forward = watches(after, after.objects), back = prior ? watches(prior, prior.objects) : [];
	const scopeOf = (watch: Watch): Scope => ({ world: watch.world, controller: watch.controller, source: watch.object });
	// Torpor Orb: an event a suppression names causes no triggers.
	const suppressed = (occurrence: Occurrence) => (occurrence.lookBack ? back : forward).some((watch) =>
		watch.registration.kind === "suppress" && !!fits(scopeOf(watch), watch.registration.event, occurrence));
	const live = happened.filter((occurrence) => !suppressed(occurrence));
	const waiting: Trigger[] = [], spent: string[] = [];
	const stamp = () => `trigger-${table.cursor.clock + 1}-${waiting.length}`;

	const raise = (scope: Scope, controller: SeatId, source: ObjectRef, basis: string, event: GameEvent, rest: Pick<Trigger, "effect" | "check" | "may" | "limit" | "bound" | "targets" | "x" | "transformAt">, once = false, additional = 0): boolean => {
		const matched = live.filter((occurrence) => !!occurrence.lookBack === (scope.world !== after)).flatMap((occurrence) => fits(scope, event, occurrence) ?? []);
		if (!matched.length) return false;
		// Each occurrence is its own trigger (603.2c), unless the card says "one or more"; a once-only delayed trigger fires for the first alone (603.7b).
		for (const group of groups(event, matched)) {
			const made: Trigger = { id: stamp(), controller, source, basis, ...structuredClone(rest), event: eventOf(group), turn: table.cursor.turn };
			const eventScope = { ...scope, event: { ...(made.event.object && group[0]!.object ? { object: group[0]!.object } : {}), ...(made.event.player !== undefined ? { player: made.event.player } : {}),
				...(made.event.source && group[0]!.source ? { source: group[0]!.source } : {}), ...(made.event.recipient && group[0]!.recipient ? { recipient: group[0]!.recipient } : {}),
				...(made.event.amount !== undefined ? { amount: made.event.amount } : {}) } };
			if (made.check && !holds(eventScope, made.check)) continue;
			if (made.limit === "once-per-turn" && triggeredThisTurn(table, source, basis, waiting)) continue;
			if (made.limit === "once-per-turn-use" && usedThisTurn(table, source, basis, controller)) continue;
			waiting.push(made);
			// 603.2d adds independent instances once, not recursive multiplication.
			// A once-per-turn trigger's restriction still allows only one instance.
			if (made.limit !== "once-per-turn") for (let at = 0; at < additional; at++) waiting.push({ ...structuredClone(made), id: stamp() });
			if (once) break;
		}
		return true;
	};

	for (const watch of [...back, ...forward]) {
		const registration = watch.registration;
		if (registration.kind !== "watch") continue;
		raise(scopeOf(watch), watch.controller, ref(watch.object), registration.basis, registration.event, {
			effect: registration.effect, ...(registration.if ? { check: registration.if } : {}), ...(registration.may ? { may: true } : {}),
			...(registration.limit ? { limit: registration.limit } : {}) }, false, additionalTriggers(watch.world, watch.object));
	}
	// Delayed triggers belong to the table and fire even after their source is gone (603.7c).
	for (const world of prior ? [prior, after] : [after]) {
		for (const note of world.notes) {
			if (note.kind !== "delay" || note.written > table.cursor.clock) continue;
			// A while-source delay may have expired in this group. Departures
			// still read its prior existence; later events read the current notes.
			if ((note.event.on === "leaves" || note.event.on === "dies") !== (world !== after)) continue;
			const scope: Scope = { world, controller: note.by, source: world.lastKnown(note.fixed.source)?.object ?? after.lastKnown(note.fixed.source)?.object,
				targets: note.fixed.targets, bound: note.fixed.bound, ...(note.fixed.x !== undefined ? { x: note.fixed.x } : {}) };
			const fired = raise(scope, note.by, note.fixed.source, `Delayed: ${note.effect.instructions.map(summary).join(" ")}`, note.event, {
				effect: note.effect, bound: note.fixed.bound, targets: note.fixed.targets, ...(note.fixed.x !== undefined ? { x: note.fixed.x } : {}),
				...(note.fixed.transformAt !== undefined ? { transformAt: note.fixed.transformAt } : {}) }, note.once);
			if (fired && note.once) spent.push(note.id);
		}
	}
	if (speed && !triggeredThisTurn(table, undefined, speed.basis, waiting, speed.controller)) waiting.push({ ...speed, id: stamp() });
	return { waiting, spent };
}

/** What a resolving trigger's `event:*` refs name now. */
export function eventScope(world: World, event: Trigger["event"] | undefined): Scope["event"] {
	if (!event) return undefined;
	const seen = (one?: ObjectRef) => one ? world.lastKnown(one)?.object : undefined;
	return { ...(seen(event.object) ? { object: seen(event.object)! } : {}), ...(event.objects ? { objects: event.objects.flatMap((one) => seen(one) ?? []) } : {}),
		...(event.player !== undefined ? { player: event.player } : {}), ...(seen(event.source) ? { source: seen(event.source)! } : {}),
		...(seen(event.recipient) ? { recipient: seen(event.recipient)! } : {}), ...(event.amount !== undefined ? { amount: event.amount } : {}) };
}

/**
 * Situation 5: waiting triggers go on the stack before anyone receives priority,
 * active player first (603.3b). The seat picks which of its own goes next and
 * its targets; the last one put on resolves first. A trigger with no legal
 * targets is removed (603.3d).
 */
export function triggerWindow(table: Table): Pending | null {
	const order = playing(table), at = order.findIndex((one) => one.id === table.cursor.active);
	const apnap = [...order.slice(at), ...order.slice(0, at)];
	// One round at a time: what triggered while this round was put waits for the next (603.3b).
	const round = Math.min(...table.waiting.map((trigger) => trigger.round ?? 0));
	const current = table.waiting.filter((trigger) => (trigger.round ?? 0) === round);
	const seat = apnap.find((one) => current.some((trigger) => trigger.controller === one.id));
	if (!seat) return null;
	const world = tableWorld(table);
	const mine = current.filter((trigger) => trigger.controller === seat.id);
	const sourceName = (trigger: (typeof mine)[number]) => { const source = world.lastKnown(trigger.source)?.object; return source?.faceDown ? `Face-down creature (${source.id})` : source?.card ?? source?.token?.name ?? trigger.source?.id ?? "Inherent ability"; };
	// Putting one on now places it under every trigger put later, so it resolves after them.
	const after = (trigger: (typeof mine)[number]) => { const others = mine.filter((other) => other !== trigger).map((other) => `${sourceName(other)}'s trigger`);
		return others.length ? `Put on now, it resolves after ${[...new Set(others)].map((one) => { const n = others.filter((other) => other === one).length; return n > 1 ? `${one} (x${n})` : one; }).join(", ")}.` : "It is the last trigger to put on."; };
	const moves: Move[] = mine.flatMap((trigger): Move[] => {
		const source = world.lastKnown(trigger.source)?.object;
		const name = sourceName(trigger);
		const scope: Scope = { world, controller: trigger.controller, ...(source ? { source } : {}), event: eventScope(world, trigger.event),
			...(trigger.bound ? { bound: trigger.bound } : {}), ...(trigger.x !== undefined ? { x: trigger.x } : {}) };
		const modal = "modes" in trigger.effect;
		const effects = "modes" in trigger.effect ? trigger.effect.modes : [trigger.effect];
		const choices = effects.flatMap((effect, mode): Move[] => {
			const slots = effect.targets ?? [], modeName = modal ? ` Mode ${mode + 1}: ${effect.instructions.map(summary).join(" ")}` : "";
			const aims = slots.length ? targetings(slots, scope) : [trigger.targets ?? []];
			return aims.map((targets): Move => {
				const id = `ability-${table.cursor.clock + 1}`;
				const ability: Ability = { ...(trigger.source ? { source: trigger.source } : {}), controller: trigger.controller, claim: `${name}: ${trigger.basis}${modeName}`, basis: trigger.basis, timing: "stack",
					...(doubleFaced(table.printed[source?.card ?? ""]) ? { transformAt: trigger.transformAt ?? source?.transformed ?? 0 } : {}),
					cost: { generic: 0, colors: [] }, paid: [], targets, slots: structuredClone(slots), instructions: structuredClone(effect.instructions),
					trigger: { event: structuredClone(trigger.event), ...(trigger.chapter !== undefined ? { chapter: trigger.chapter } : {}), ...(trigger.check ? { check: structuredClone(trigger.check) } : {}), ...(trigger.may ? { may: true } : {}),
						...(trigger.limit === "once-per-turn-use" ? { limit: trigger.limit } : {}),
						...(trigger.bound ? { bound: structuredClone(trigger.bound) } : {}) }, ...(trigger.x !== undefined ? { x: trigger.x } : {}) };
				const aimed = slots.length ? aiming(targets, world, trigger.controller) : [];
				const recipient = trigger.event.recipient && world.lastKnown(trigger.event.recipient)?.object;
				const recipientName = recipient && !recipient.faceDown && PUBLIC.has(recipient.zone) ? recipient.card ?? recipient.token?.name ?? recipient.id : "an unknown permanent";
				const eventAmount = trigger.event.amount === undefined ? [] : [`Amount in this event: ${trigger.event.amount}${trigger.event.recipient ? ` to ${recipientName}` : trigger.event.player !== undefined ? ` to seat ${trigger.event.player}` : ""}.`];
				return { option: { id: `trigger:${trigger.id}${modal ? `:mode:${mode}` : ""}${slots.length ? targets.map((set, slot) => set.length ? `:t${slot}=${set.map(targetChoiceKey).join("+")}` : "").join("") : ""}`,
					label: [`Put on the stack: ${name}: ${trigger.basis}${modeName}`, ...aimed].join(" "),
					shows: [trigger.source ? `Source: ${name} (${trigger.source.id}@${trigger.source.incarnation}).` : "This inherent ability has no source.", ...eventAmount, ...aimed, ...effect.instructions.map(summary), after(trigger)].join(" "),
					objects: [...(trigger.source ? [trigger.source] : []), ...targets.flat().flatMap((chosen) => "id" in chosen ? [chosen] : [])],
					trigger: { id: trigger.id, name: trigger.source ? `${name} (${trigger.source.id}@${trigger.source.incarnation})` : name, text: `${trigger.basis}${modeName}`, targets: structuredClone(targets.flat()) } },
					changes: [{ do: "trigger", action: "put", trigger: trigger.id, id, ability, was: triggered(trigger) }], reason: "resolve" };
			});
		});
		return choices.length ? choices : [{ option: { id: `trigger:${trigger.id}:removed`, label: `${name}: ${trigger.basis}`,
			shows: modal ? "No mode has legal targets: remove the ability (603.3c)." : "No legal targets: it is removed from the stack (603.3d)." },
			changes: [{ do: "trigger", action: "put", trigger: trigger.id, was: triggered(trigger) }], reason: "resolve" }];
	});
	return { situation: "trigger-order", seat: seat.id, question: "Choose one waiting trigger and its targets to put on the stack. Triggers put on later resolve first (603.3b).", moves };
}
