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
import { characteristics, walk, type Traits } from "./characteristics.ts";
import { aiming, summary, targetings } from "./announce.ts";
import { holds, matches, players, tableWorld, targetKey, viewWorld, type Scope, type Seen, type World } from "./selectors.ts";
import { playing, type Activation, type Table, type Thing, type Trigger } from "./table.ts";
import type { Pending, Move } from "./moves.ts";
import type { GameEvent, Registration } from "./language.ts";
import type { Change, Zone } from "./syntax.ts";
import type { Frame, ObjectRef, SeatId } from "./types.ts";
import type { Step } from "./steps.ts";

/** One thing that happened in a group, as a watch reads it. */
type Occurrence = {
	on: GameEvent["on"];
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
	from?: Zone;
	to?: Zone;
	step?: Step;
	whose?: SeatId;
	toPlayer?: true;
	lookBack?: true;
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
		players: world.players.map((one) => ({ ...one })), notes: [...table.notes], combat: structuredClone(table.combat), history,
		lastKnown: (wanted) => { const object = objects.find((one) => one.id === wanted.id && one.incarnation === wanted.incarnation); return object ? { object, traits: traits.get(object.id) } : undefined; },
	};
}

/** What one group did that a watch can see. */
function occurrences(table: Table, changes: Change[], receipt: { before: Record<string, Thing>; known: Record<string, Traits> }): Occurrence[] {
	const found: Occurrence[] = [];
	const now = (id: string) => table.things.get(id);
	for (const change of changes) {
		switch (change.do) {
			case "move": {
				const was = receipt.before[change.what], is = now(change.what);
				if (!was || !is) break;
				if (change.to === "battlefield") found.push({ on: "enters", object: is, traits: characteristics(table, is), found: ref(is), from: was.zone, to: "battlefield" });
				if (was.zone === "battlefield" && is.zone !== "battlefield") {
					const left: Occurrence = { on: "leaves", object: was, traits: receipt.known[was.id], found: PUBLIC.has(is.zone) ? ref(is) : ref(was), from: "battlefield", to: is.zone, lookBack: true };
					found.push(left);
					// 700.4: dies means put into a graveyard from the battlefield.
					if (is.zone === "graveyard") found.push({ ...left, on: "dies" });
				}
				break;
			}
			case "token": {
				const is = now(change.id);
				if (is) found.push({ on: "enters", object: is, traits: characteristics(table, is), found: ref(is), to: "battlefield" });
				break;
			}
			case "activate": case "trigger": {
				const ability = change.do === "activate" ? change.ability : change.action === "put" ? change.ability : undefined;
				const id = change.do === "activate" ? (ability?.timing === "spell" ? change.what : change.id) : change.action === "put" ? change.id : undefined;
				const spell = id ? now(id) : undefined;
				if (!ability || !spell || ability.timing === "mana") break;
				// Cast from the zone the card was in before the group moved it to the stack (601.2a).
				const from = receipt.before[spell.id]?.zone;
				if (change.do === "activate" && ability.timing === "spell") found.push({ on: "cast", object: spell, traits: characteristics(table, spell), found: ref(spell), player: ability.controller, ...(from && from !== "stack" ? { from } : {}) });
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
				const source = now(change.source);
				if (!change.combat || !source) break;
				found.push({ on: "combat-damage", object: source, traits: characteristics(table, source), found: ref(source), source, player: source.controller,
					...("player" in change.target ? { dealt: change.target.player, toPlayer: true as const } : {}) });
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
	const side = (ref: string | undefined, seat?: SeatId) => ref === undefined || ref === "any" || (seat !== undefined && players(scope, ref).includes(seat));
	if (!side(event.by, occurrence.player) || !side(event.whose, occurrence.whose)) return null;
	if (event.step && event.step !== occurrence.step) return null;
	if (event.from && !(occurrence.from && event.from.includes(occurrence.from as never))) return null;
	if (event.to && !(occurrence.to && event.to.includes(occurrence.to as never))) return null;
	if (event.player && !occurrence.toPlayer) return null;
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
	const objects = occurrences.flatMap((one) => one.objects ? one.objects.map((each) => ref(each.object)) : one.found ? [one.found] : []);
	return { ...(first.found ? { object: first.found } : objects[0] ? { object: objects[0] } : {}), ...(objects.length ? { objects } : {}),
		...((first.dealt ?? first.player) !== undefined ? { player: (first.dealt ?? first.player)! } : {}), ...(first.source ? { source: ref(first.source) } : {}) };
}

/** Whether this ability already triggered this turn, for "only once each turn". */
function triggeredThisTurn(table: Table, source: ObjectRef, basis: string, also: Trigger[]): boolean {
	// What triggered this turn: still waiting, or put on the stack, or removed from it for want of a target (603.3d).
	const same = (trigger: Pick<Trigger, "source" | "basis" | "turn">) => trigger.source.id === source.id && trigger.source.incarnation === source.incarnation &&
		trigger.basis === basis && (trigger.turn ?? table.cursor.turn) === table.cursor.turn;
	if ([...table.waiting, ...also].some(same)) return true;
	const began = table.cursor.began[table.cursor.active] ?? 0;
	return table.log.some((receipt) => (receipt.clock ?? 0) > began && receipt.changes.some((change) => change.do === "trigger" && change.action === "wait" ? same(change.trigger) :
		change.do === "trigger" && change.action === "put" && (change.was ? same(change.was) : !!change.ability && same({ source: change.ability.source, basis: change.ability.basis }))));
}

/** What a put change keeps of the trigger, so a once-each-turn count can read it back. */
const triggered = (trigger: Trigger): Pick<Trigger, "source" | "basis" | "turn"> => ({ source: trigger.source, basis: trigger.basis, ...(trigger.turn !== undefined ? { turn: trigger.turn } : {}) });

/** A watcher: a permanent's watch or suppression, read on one side of the group. */
type Watch = { object: Seen; controller: SeatId; registration: Registration; world: World };

function watches(world: World, objects: Seen[]): Watch[] {
	return objects.filter((object) => object.zone === "battlefield").flatMap((object) => (world.read(object)?.registrations ?? [])
		.filter((registration) => registration.kind === "watch" || registration.kind === "suppress")
		.map((registration) => ({ object, controller: object.controller, registration, world })));
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
	if (!happened.length) return { waiting: [], spent: [] };
	const after = tableWorld(table);
	const forward = watches(after, after.objects), back = prior ? watches(prior, prior.objects) : [];
	const scopeOf = (watch: Watch): Scope => ({ world: watch.world, controller: watch.controller, source: watch.object });
	// Torpor Orb: an event a suppression names causes no triggers.
	const suppressed = (occurrence: Occurrence) => (occurrence.lookBack ? back : forward).some((watch) =>
		watch.registration.kind === "suppress" && !!fits(scopeOf(watch), watch.registration.event, occurrence));
	const live = happened.filter((occurrence) => !suppressed(occurrence));
	const waiting: Trigger[] = [], spent: string[] = [];
	const stamp = () => `trigger-${table.cursor.clock + 1}-${waiting.length}`;

	const raise = (scope: Scope, controller: SeatId, source: ObjectRef, basis: string, event: GameEvent, rest: Pick<Trigger, "effect" | "check" | "may" | "limit" | "bound" | "targets" | "x">, once = false): boolean => {
		const matched = live.filter((occurrence) => !!occurrence.lookBack === (scope.world !== after)).flatMap((occurrence) => fits(scope, event, occurrence) ?? []);
		if (!matched.length) return false;
		// Each occurrence is its own trigger (603.2c), unless the card says "one or more"; a once-only delayed trigger fires for the first alone (603.7b).
		for (const group of event.batch ? [matched] : matched.map((one) => [one])) {
			const made: Trigger = { id: stamp(), controller, source, basis, ...structuredClone(rest), event: eventOf(group), turn: table.cursor.turn };
			const eventScope = { ...scope, event: { ...(group[0]!.object ? { object: group[0]!.object } : {}), ...(made.event.player !== undefined ? { player: made.event.player } : {}),
				...(group[0]!.source ? { source: group[0]!.source } : {}) } };
			if (made.check && !holds(eventScope, made.check)) continue;
			if (made.limit && triggeredThisTurn(table, source, basis, waiting)) continue;
			waiting.push(made);
			if (once) break;
		}
		return true;
	};

	for (const watch of [...back, ...forward]) {
		const registration = watch.registration;
		if (registration.kind !== "watch") continue;
		raise(scopeOf(watch), watch.controller, ref(watch.object), registration.basis, registration.event, {
			effect: registration.effect, ...(registration.if ? { check: registration.if } : {}), ...(registration.may ? { may: true } : {}),
			...(registration.limit ? { limit: registration.limit } : {}) });
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
				effect: note.effect, bound: note.fixed.bound, targets: note.fixed.targets, ...(note.fixed.x !== undefined ? { x: note.fixed.x } : {}) }, note.once);
			if (fired && note.once) spent.push(note.id);
		}
	}
	return { waiting, spent };
}

/** What a resolving trigger's `event:*` refs name now. */
export function eventScope(world: World, event: Trigger["event"] | undefined): Scope["event"] {
	if (!event) return undefined;
	const seen = (one?: ObjectRef) => one ? world.lastKnown(one)?.object : undefined;
	return { ...(seen(event.object) ? { object: seen(event.object)! } : {}), ...(event.objects ? { objects: event.objects.flatMap((one) => seen(one) ?? []) } : {}),
		...(event.player !== undefined ? { player: event.player } : {}), ...(seen(event.source) ? { source: seen(event.source)! } : {}) };
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
	const sourceName = (trigger: (typeof mine)[number]) => { const source = world.lastKnown(trigger.source)?.object; return source?.card ?? source?.token?.name ?? trigger.source.id; };
	// Putting one on now places it under every trigger put later, so it resolves after them.
	const after = (trigger: (typeof mine)[number]) => { const others = mine.filter((other) => other !== trigger).map((other) => `${sourceName(other)}'s trigger`);
		return others.length ? `Put on now, it resolves after ${[...new Set(others)].map((one) => { const n = others.filter((other) => other === one).length; return n > 1 ? `${one} (x${n})` : one; }).join(", ")}.` : "It is the last trigger to put on."; };
	const moves: Move[] = mine.flatMap((trigger): Move[] => {
		const source = world.lastKnown(trigger.source)?.object;
		const name = source?.card ?? source?.token?.name ?? trigger.source.id;
		const slots = trigger.effect.targets ?? [];
		const scope: Scope = { world, controller: trigger.controller, ...(source ? { source } : {}), event: eventScope(world, trigger.event),
			...(trigger.bound ? { bound: trigger.bound } : {}), ...(trigger.x !== undefined ? { x: trigger.x } : {}) };
		const aims = slots.length ? targetings(slots, scope) : [trigger.targets ?? []];
		if (!aims.length) return [{ option: { id: `trigger:${trigger.id}:removed`, label: `${name}: ${trigger.basis}`, shows: "No legal targets: it is removed from the stack (603.3d)." },
			changes: [{ do: "trigger", action: "put", trigger: trigger.id, was: triggered(trigger) }], reason: "resolve" }];
		return aims.map((targets): Move => {
			const id = `ability-${table.cursor.clock + 1}`;
			const ability: Activation = { source: trigger.source, controller: trigger.controller, claim: `${name}: ${trigger.basis}`, basis: trigger.basis, timing: "stack",
				cost: { generic: 0, colors: [] }, paid: [], targets, slots: structuredClone(slots), instructions: structuredClone(trigger.effect.instructions),
				trigger: { event: structuredClone(trigger.event), ...(trigger.check ? { check: structuredClone(trigger.check) } : {}), ...(trigger.may ? { may: true } : {}),
					...(trigger.bound ? { bound: structuredClone(trigger.bound) } : {}) }, ...(trigger.x !== undefined ? { x: trigger.x } : {}) };
			const aimed = slots.length ? aiming(targets, world, trigger.controller) : [];
			return { option: { id: `trigger:${trigger.id}${slots.length ? targets.map((set, slot) => set.length ? `:t${slot}=${set.map(targetKey).join("+")}` : "").join("") : ""}`,
				label: [`Put on the stack: ${name}: ${trigger.basis}`, ...aimed].join(" "),
				shows: [`Source: ${name} (${trigger.source.id}@${trigger.source.incarnation}).`, ...aimed, ...trigger.effect.instructions.map(summary), after(trigger)].join(" "),
				objects: [trigger.source, ...targets.flat().flatMap((chosen) => "id" in chosen ? [chosen] : [])] },
				changes: [{ do: "trigger", action: "put", trigger: trigger.id, id, ability, was: triggered(trigger) }], reason: "resolve" };
		});
	});
	return { situation: "trigger-order", seat: seat.id, question: "Choose which of your waiting triggers resolves last. It goes on the stack now, under every trigger you put on after it (603.3b).", moves };
}
