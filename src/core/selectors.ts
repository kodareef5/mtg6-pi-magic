/**
 * Reading the syntax against a world: which objects a ref or selector means,
 * what an amount is, whether a condition holds. docs/SYNTAX.md.
 *
 * A world is what a reader knows. The table's own world holds every object,
 * libraries included, and is what resolution reads. A seat's world is built
 * from its view, so what it is offered and what its plan's conditions test is
 * only what it has earned. Everything is worked out when it is asked for.
 * Past 150 lines because refs, selectors, amounts and conditions read each other.
 */
import { playing, type Combat, type Note, type Table, type Thing } from "./table.ts";
import type { Amount, Condition, Selector } from "./language.ts";
import { characteristics, creatureType, type Traits } from "./characteristics.ts";
import type { ObjectRef, SeatId, SeatView } from "./types.ts";
import type { SeenObject } from "./work.ts";
import { casting, type Casting } from "./casting.ts";
import { resolutionNumber } from "./resolution-counts.ts";
import type { Step } from "./steps.ts";

export type Seen = Pick<Thing, "id" | "incarnation" | "zone" | "owner" | "controller" | "tapped" | "faceDown" | "counters" | "damage"> &
	Partial<Pick<Thing, "attached" | "token" | "ability" | "position" | "entered" | "face" | "doors" | "transformed" | "prepared" | "designations" | "copy" | "copied" | "choices" | "registrations" | "lookedBy">> & { card?: string };
/** Something that happened this turn that cards count. All of it is public. */
export type Happened =
	| { kind: "cast"; by: SeatId; spell: Seen; traits?: Traits }
	| { kind: "activated"; by: SeatId; source: ObjectRef; basis: string; loyalty?: true }
	| { kind: "resolved"; by: SeatId; source?: ObjectRef; basis: string }
	| { kind: "attacked"; by: SeatId; attackers: { object: Seen; traits?: Traits }[] }
	| { kind: "life"; who: SeatId; amount: number };
export type World = {
	printed?: Table["printed"];
	objects: Seen[];
	read(object: Seen): Traits | undefined;
	players: { id: SeatId; life: number; speed?: number; startingLife?: number; name?: string }[];
	notes: Note[];
	combat: Combat | null;
	history: Happened[];
	/** The object as it is, or as it last was (608.2h). */
	lastKnown(ref: ObjectRef | undefined): { object: Seen; traits?: Traits } | undefined;
	casting?(ref: ObjectRef): Casting | undefined;
	/** Whose turn it is and how many turns each seat has begun, the current one included. Absent before the first turn. */
	turn?: { active: SeatId; taken: Record<SeatId, number>; began?: number; step?: Step; stepDone?: boolean };
};

/** Turns each seat has begun so far, from who started and the turn number: seats alternate from the first. */
export function turnsTaken(starting: SeatId, seats: SeatId[], turn: number): Record<SeatId, number> {
	const order = [starting, ...seats.filter((one) => one !== starting)];
	return Object.fromEntries(order.map((seat, at) => [seat, Math.max(0, Math.floor((turn - at + order.length - 1) / order.length))])) as Record<SeatId, number>;
}
export type Chosen = (ObjectRef | { player: SeatId }) & { amount?: number };
/** What an earlier instruction bound with `as`. */
export type Bound = { objects: ObjectRef[]; players: SeatId[]; amount?: number };
export type Scope = {
	world: World;
	/** "You": the controller of the spell or ability. */
	controller: SeatId;
	/** "This". Gone, it is read as it last existed. */
	source?: Seen;
	/** One list per target slot. */
	targets?: Chosen[][];
	/** Targets that were illegal as resolution began (608.2b), by `targetKey`: they name nothing. */
	illegal?: string[];
	bound?: Record<string, Bound>;
	event?: { object?: Seen; objects?: Seen[]; player?: SeatId; source?: Seen; recipient?: Seen; amount?: number };
	x?: number;
	/** The ability currently resolving, independent of whether its source still exists. */
	resolving?: { source: ObjectRef; basis: string };
};

/** The table's own world. `read` overrides characteristics during the layer walk. */
export function tableWorld(table: Table, read?: (object: Seen) => Traits | undefined): World {
	const reader = read ?? ((object: Seen) => characteristics(table, object as Thing));
	let events: Happened[] | undefined;
	return {
		objects: [...table.things.values()], read: reader, printed: table.printed,
		players: playing(table).map((one) => ({ id: one.id, life: one.life, ...(one.speed === undefined ? {} : { speed: one.speed }), startingLife: table.format.startingLife, name: one.name })),
		notes: table.notes, combat: table.combat,
		...(table.cursor.turn > 0 ? { turn: { active: table.cursor.active, taken: turnsTaken(table.seats[0]!.id, table.seats.map((one) => one.id), table.cursor.turn), began: table.cursor.began[table.cursor.active], step: table.cursor.steps[0], stepDone: table.cursor.stepDone } } : {}),
		get history() { return (events ??= happened(table)); },
		casting: (ref) => casting(table, ref),
		lastKnown(ref) {
			if (!ref) return undefined;
			const now = table.things.get(ref.id);
			if (now?.incarnation === ref.incarnation) return { object: now, traits: reader(now) };
			for (let at = table.log.length - 1; at >= 0; at--) {
				const was = table.log[at]!.before[ref.id];
				if (was?.incarnation === ref.incarnation) return { object: was, ...(table.log[at]!.known?.[ref.id] ? { traits: table.log[at]!.known![ref.id] } : {}) };
			}
			return undefined;
		},
	};
}

/** A damage source may have left since its ability triggered. Legacy changes name its current id. */
export function damageSource(table: Table, source: string | ObjectRef) {
	const ref = typeof source === "string" ? table.things.get(source) : source;
	return ref ? tableWorld(table).lastKnown(ref) : undefined;
}

/**
 * A faceless stand-in for each card in a hand or library the view cannot see,
 * so "cards in an opponent's hand" counts what is public and names nothing.
 */
function hidden(view: SeatView): Seen[] {
	const shown = view.objects ?? [];
	return (view.players ?? []).flatMap((player) => (["hand", "library"] as const).flatMap((zone) => {
		const count = (zone === "hand" ? player.hand : player.library) ?? 0, seen = shown.filter((one) => one.zone === zone && one.owner === player.id).length;
		return Array.from({ length: Math.max(0, count - seen) }, (_, at): Seen => ({ id: `hidden-${zone}-${player.id}-${at}`, incarnation: 0, zone, owner: player.id, controller: player.id,
			tapped: false, faceDown: true, counters: {}, damage: 0 }));
	}));
}

/** A seat's world: only what its view holds, and how many cards it cannot see. */
export function viewWorld(view: SeatView): World {
	const seen = view.objects ?? [], objects = [...seen, ...hidden(view)];
	return {
		objects, read: (object) => (object as SeenObject).traits, printed: view.printed,
		players: (view.players ?? []).map((one) => ({ ...one, name: view.seats?.find((seat) => seat.id === one.id)?.name })), notes: view.notes ?? [],
		combat: view.combat ?? null, history: view.history ?? [],
		lastKnown(ref) { if (!ref) return undefined; const object = seen.find((one) => one.id === ref.id && one.incarnation === ref.incarnation); return object ? { object, ...(object.traits ? { traits: object.traits } : {}) } : undefined; },
		casting: (ref) => view.castings?.[targetKey(ref)],
		...(view.window.kind === "turn" && view.starting !== undefined ? { turn: { active: view.window.active,
			taken: turnsTaken(view.starting, (view.seats ?? view.players ?? []).map((one) => one.id), view.window.turn), began: view.turnBegan, step: view.window.step, stepDone: view.stepDone } } : {}),
	};
}

/** This turn's public events cards count, from the receipts. Nothing is kept beside the log. */
export function happened(table: Table): Happened[] {
	const began = table.cursor.began[table.cursor.active] ?? 0, events: Happened[] = [];
	for (const receipt of table.log) {
		if ((receipt.clock ?? 0) <= began) continue;
		for (const change of receipt.changes) {
			if (change.do === "resolution" && change.action === "next" && change.resolved) events.push({ kind: "resolved", ...change.resolved });
			if (change.do === "activate" && (change.ability.timing === "stack" || change.ability.timing === "mana")) events.push({ kind: "activated", by: change.ability.controller, source: change.ability.source, basis: change.ability.basis,
				...(change.ability.cost.loyalty !== undefined ? { loyalty: true } : {}) });
			if (change.do === "activate" && change.ability.timing === "spell") {
				const spell = receipt.after[change.what] ?? receipt.before[change.what];
				const traits = spell && characteristics(table, spell);
				if (spell) events.push({ kind: "cast", by: change.ability.controller, spell, ...(traits ? { traits } : {}) });
			}
			if (change.do === "attack") events.push({ kind: "attacked", by: table.cursor.active, attackers: change.attackers.map((one) => {
				const now = table.things.get(one.id);
				const traits = now?.incarnation === one.incarnation ? characteristics(table, now) : undefined;
				const object = receipt.before[one.id] ?? now!;
				if (!object.faceDown) return { object, ...(traits ? { traits } : {}) };
				const { card, copied, registrations, choices, copy, ...publicObject } = object;
				return { object: publicObject, traits: receipt.known?.[one.id] ?? characteristics(table, object) };
			}) });
			if (change.do === "damage" && "player" in change.target) events.push({ kind: "life", who: change.target.player, amount: -change.amount });
			if (change.do === "change-life") events.push({ kind: "life", who: change.who, amount: change.amount });
		}
	}
	return events;
}

export const targetKey = (chosen: Chosen) => "player" in chosen ? `seat-${chosen.player}` : `${chosen.id}@${chosen.incarnation}`;
const live = (world: World, ref: ObjectRef) => world.objects.find((one) => one.id === ref.id && one.incarnation === ref.incarnation);
const traitsOf = (scope: Scope, object: Seen) =>
	live(scope.world, object) ? scope.world.read(object) : scope.world.lastKnown(object)?.traits ?? scope.world.read(object);

/** Motion needs live objects. Information can read a departed target or binding as it last existed (608.2h). */
export function objects(scope: Scope, ref: string | { top: Amount; of: string } | { exceptBottom: Amount; of: string }, information = false): Seen[] {
	if (typeof ref !== "string") return players(scope, ref.of).flatMap((owner) => {
		const library = scope.world.objects.filter((one) => one.zone === "library" && one.owner === owner).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
		return library.slice(0, "top" in ref ? Math.max(0, amount(scope, ref.top)) : Math.max(0, library.length - Math.max(0, amount(scope, ref.exceptBottom))));
	});
	const [head, rest] = [ref.split(":")[0], ref.slice(ref.indexOf(":") + 1)];
	const read = (one: ObjectRef) => live(scope.world, one) ?? (information ? scope.world.lastKnown(one)?.object : undefined);
	switch (head) {
		case "this": return scope.source ? [scope.source] : [];
		case "attached": { const at = scope.source?.attached && live(scope.world, scope.source.attached); return at ? [at] : []; }
		case "target": return (scope.targets?.[Number(rest)] ?? []).flatMap((chosen) => "id" in chosen && !scope.illegal?.includes(targetKey(chosen)) ? read(chosen) ?? [] : []);
		case "bound": return (scope.bound?.[rest]?.objects ?? []).flatMap((one) => read(one) ?? []);
		case "source": return objects(scope, rest, true).flatMap(one => {
			const source = one.ability?.timing === "spell" ? one : one.ability?.source;
			return source ? read(source) ?? [] : [];
		});
		case "event": {
			if (rest === "objects") return scope.event?.objects ?? [];
			const object = scope.event?.[rest as "object" | "source" | "recipient"];
			return object ? [object] : [];
		}
		default: return [];
	}
}

/** The players a ref names. */
export function players(scope: Scope, ref: string): SeatId[] {
	const all = scope.world.players.map((one) => one.id);
	const [head, rest] = [ref.split(":")[0], ref.slice(ref.indexOf(":") + 1)];
	switch (head) {
		case "you": case "self": return [scope.controller];
		case "opponent": return all.filter((id) => id !== scope.controller);
		case "each-player": return all;
		case "event": return scope.event?.player === undefined ? [] : [scope.event.player];
		case "target": return (scope.targets?.[Number(rest)] ?? []).flatMap((chosen) => "player" in chosen && !scope.illegal?.includes(targetKey(chosen)) ? [chosen.player] : []);
		case "bound": return scope.bound?.[rest]?.players ?? [];
		case "controller": return objects(scope, rest, true).map((one) => one.controller);
		case "owner": return objects(scope, rest, true).map((one) => one.owner);
		default: return [];
	}
}

const side = (scope: Scope, ref: string | undefined, seatId: SeatId) => ref === undefined || ref === "any" || players(scope, ref).includes(seatId);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An ability on the stack is an object (113.1c) but not a card: it has no types, words or abilities to match. */
const ability = (object: Seen): Traits | undefined => object.ability && !object.card && !object.token
	? { name: object.ability.claim, supertypes: [], types: [], subtypes: [], colors: [], manaValue: 0, words: [], registrations: [] } : undefined;

const FACELESS: Traits = { name: "", supertypes: [], types: [], subtypes: [], colors: [], words: [], registrations: [] };
const subtypes = (scope: Scope, types: NonNullable<Selector["subtypes"]>): string[] => Array.isArray(types) ? types :
	scope.source?.choices?.[types.chosen] ? [scope.source.choices[types.chosen]!] : [];

/** Freeze a source's named type choice for mana that can outlive that source. */
export function chosenSelector(scope: Scope, selector: Selector): Selector {
	return { ...selector, ...(selector.subtypes ? { subtypes: subtypes(scope, selector.subtypes) } : {}),
		...(typeof selector.name === "object" ? { name: scope.source?.choices?.[selector.name.chosen] ?? "" } : {}),
		...(selector.not ? { not: chosenSelector(scope, selector.not) } : {}),
		...(selector.any ? { any: selector.any.map((one) => chosenSelector(scope, one)) } : {}),
		...(selector.all ? { all: selector.all.map((one) => chosenSelector(scope, one)) } : {}) };
}
export function matches(scope: Scope, object: Seen, selector: Selector, read = traitsOf(scope, object), inherited: readonly string[] = ["battlefield"]): boolean {
	const zones = selector.zones ?? inherited;
	if ((selector.zones || !selector.any && !selector.all) && !zones.includes(object.zone)) return false;
	if (selector.ability && (object.zone !== "stack" || object.ability?.timing !== "stack" ||
		selector.ability !== "any" && selector.ability !== (object.ability.trigger ? "triggered" : "activated"))) return false;
	if (selector.any && !selector.any.some((branch) => matches(scope, object, branch, read, zones))) return false;
	if (selector.all && !selector.all.every((branch) => matches(scope, object, branch, read, zones))) return false;
	// Neither an unknown card nor a face-down exiled card supplies characteristics.
	const blind = !read && !object.ability && object.faceDown;
	if (blind && (selector.name || selector.nameOf || selector.types || selector.subtypes || selector.supertypes || selector.words || selector.not || selector.power || selector.toughness || selector.manaValue || selector.colors || selector.hasAdventure !== undefined)) return false;
	const traits = blind ? FACELESS : read ?? ability(object);
	if (!traits) return false;
	const holder = object.zone === "battlefield" || object.zone === "stack" ? object.controller : object.owner;
	if (!side(scope, selector.controller, holder) || !side(scope, selector.owner, object.owner)) return false;
	const subtype = (wanted: string) => traits.subtypes.some((one) => same(one, wanted)) || (!!traits.allCreatureTypes && creatureType(wanted));
	if (selector.name !== undefined) {
		const name = typeof selector.name === "string" ? selector.name : scope.source?.choices?.[selector.name.chosen];
		if (!name || !same(traits.name, name)) return false;
	}
	if (selector.nameOf) {
		const names = objects(scope, selector.nameOf, true).flatMap((one) => traitsOf(scope, one)?.name.split(" // ").filter(Boolean) ?? []);
		if (!traits.name.split(" // ").some((name) => names.some((other) => same(name, other)))) return false;
	}
	if (selector.types && !selector.types.some((type) => traits.types.includes(type))) return false;
	// 715.2a: inactive alternative characteristics still count. A Prepare copy has only its copied face.
	if (selector.hasAdventure !== undefined) {
		const adventure = !object.faceDown && !object.copy && !!object.card && !!scope.world.printed?.[object.card]?.faces?.some((face) => face.type.split("—")[1]?.trim().split(/\s+/).includes("Adventure"));
		if (selector.hasAdventure !== adventure) return false;
	}
	if (selector.subtypes && !subtypes(scope, selector.subtypes).some(subtype)) return false;
	if (selector.supertypes && !selector.supertypes.some((one) => traits.supertypes.includes(one))) return false;
	if (selector.words && !selector.words.every((word) => traits.words.includes(word))) return false;
	const colored = (colors: readonly string[]) => colors.length ? colors.some((color) => traits.colors.includes(color as never)) : !traits.colors.some((color) => color !== "C");
	if (selector.colors && !colored(selector.colors)) return false;
	const not = selector.not;
	if (not && (not.types?.some((type) => traits.types.includes(type)) || not.subtypes && subtypes(scope, not.subtypes).some(subtype) ||
		not.supertypes?.some((one) => traits.supertypes.includes(one)) || not.words?.some((word) => traits.words.includes(word)) || not.colors && colored(not.colors) ||
		not.is && objects(scope, not.is).some((one) => one.id === object.id && one.incarnation === object.incarnation))) return false;
	const within = (value: number | undefined, range?: { atLeast?: Amount; atMost?: Amount }) => !range ||
		(value !== undefined && (range.atLeast === undefined || value >= amount(scope, range.atLeast)) && (range.atMost === undefined || value <= amount(scope, range.atMost)));
	if (!within(traits.power, selector.power) || !within(traits.toughness, selector.toughness) || !within(traits.manaValue, selector.manaValue)) return false;
	if (selector.tapped !== undefined && selector.tapped !== object.tapped) return false;
	if (selector.designations && !selector.designations.every(one => object.designations?.includes(one))) return false;
	if (selector.token !== undefined && selector.token !== !!object.token) return false;
	const combat = scope.world.combat;
	if (selector.attacking !== undefined && selector.attacking !== !!combat?.attackers.some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.blocking !== undefined && selector.blocking !== !!combat?.blockers.some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.blocked !== undefined) {
		const turn = scope.world.turn;
		const declared = turn?.step === "declare-blockers" ? turn.stepDone : turn?.step === "combat-damage" || turn?.step === "end-of-combat";
		if (!declared || object.zone !== "battlefield" || !traits.types.includes("creature") ||
			!combat?.attackers.some(one => one.id === object.id && one.incarnation === object.incarnation) ||
			selector.blocked !== combat.blocked.some(one => one.id === object.id && one.incarnation === object.incarnation)) return false;
	}
	if (selector.other && object.id === scope.source?.id) return false;
	if (selector.is && !objects(scope, selector.is).some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.attachedTo && !objects(scope, selector.attachedTo).some((one) => object.attached?.id === one.id && object.attached.incarnation === one.incarnation)) return false;
	if (selector.linked && !scope.world.notes.some((note) => (note.kind === "link" || note.kind === "return") && note.on.id === object.id && note.on.incarnation === object.incarnation &&
		note.source.id === scope.source?.id && note.source.incarnation === scope.source.incarnation)) return false;
	if (selector.targeting && !(object.zone === "stack" && (object.ability?.targets ?? []).flat().some((chosen) => {
		const aimed = "id" in chosen ? live(scope.world, chosen) : undefined;
		return !!aimed && matches(scope, aimed, selector.targeting!);
	}))) return false;
	return true;
}

/** Every object a selector means, in id order. */
export const select = (scope: Scope, selector: Selector): Seen[] =>
	scope.world.objects.filter((object) => matches(scope, object, selector)).sort((a, b) => a.id.localeCompare(b.id));

export function amount(scope: Scope, value: Amount): number {
	if (typeof value === "number") return value;
	if ("count" in value) return select(scope, value.count).length;
	if ("aggregate" in value) {
		const values = select(scope, value.of).map((one) => traitsOf(scope, one)?.[value.value as "manaValue" | "power" | "toughness"] ?? 0);
		if (value.aggregate === "sum") return values.reduce((sum, one) => sum + one, 0);
		return values.length ? Math[value.aggregate === "max" ? "max" : "min"](...values) : 0;
	}
	if ("counters" in value) { const one = objects(scope, value.on, true)[0]; return one ? one.counters[value.counters] ?? 0 : 0; }
	if ("power" in value) { const one = objects(scope, value.power, true)[0]; return (one && traitsOf(scope, one)?.power) ?? 0; }
	if ("toughness" in value) { const one = objects(scope, value.toughness, true)[0]; return (one && traitsOf(scope, one)?.toughness) ?? 0; }
	if ("manaValue" in value) { const one = objects(scope, value.manaValue, true)[0]; return (one && traitsOf(scope, one)?.manaValue) ?? 0; }
	if ("manaSpent" in value || "colorsSpent" in value) {
		const one = objects(scope, "manaSpent" in value ? value.manaSpent : value.colorsSpent)[0];
		const paid = one && scope.world.casting?.(one);
		if (!paid) return 0;
		if ("manaSpent" in value && !value.color) return paid.mana.length;
		if (paid.mana.includes(null)) throw new Error("This cast's recorded mana has an unknown color.");
		return "colorsSpent" in value ? new Set(paid.mana.filter((color) => color !== "C")).size : paid.mana.filter((color) => color === value.color).length;
	}
	if ("bound" in value) { const bound = scope.bound?.[value.bound]; return bound?.amount ?? (bound ? bound.objects.length + bound.players.length : 0); }
	if ("distinct" in value) return new Set(select(scope, value.among).flatMap((one) => traitsOf(scope, one)?.types ?? [])).size;
	if ("speed" in value) return players(scope, value.speed).reduce((sum, id) => sum + (scope.world.players.find(one => one.id === id)?.speed ?? 0), 0);
	if ("life" in value) return players(scope, value.life).reduce((sum, id) => sum + (scope.world.players.find((one) => one.id === id)?.life ?? 0), 0);
	if ("startingLife" in value) return players(scope, value.startingLife).reduce((sum, id) => sum + (scope.world.players.find((one) => one.id === id)?.startingLife ?? 0), 0);
	if ("event" in value) return scope.event?.amount ?? 0;
	if ("resolution" in value) return resolutionNumber(scope);
	if ("half" in value) return Math[value.round === "up" ? "ceil" : "floor"](amount(scope, value.half) / 2);
	if ("history" in value) return history(scope, value);
	if ("x" in value) return scope.x ?? (scope.source && scope.world.casting?.(scope.source)?.x) ?? 0;
	if ("sum" in value) return value.sum.reduce((total: number, part) => total + amount(scope, part), 0);
	if ("turns" in value) {
		const turn = scope.world.turn; if (!turn) return 0;
		const who = value.turns === "self" ? scope.controller : scope.world.players.find((one) => one.id !== scope.controller)?.id;
		return who === undefined ? 0 : turn.taken[who] ?? 0;
	}
	return -amount(scope, value.negate);
}

function history(scope: Scope, value: Extract<Amount, { history: string }>): number {
	let total = 0;
	for (const event of scope.world.history) {
		if (value.history === "cast" && event.kind === "cast" && side(scope, value.by, event.by) && (!value.of || matches(scope, event.spell, value.of, event.traits))) total += 1;
		if (value.history === "attacked" && event.kind === "attacked" && side(scope, value.by, event.by))
			total += event.attackers.filter((one) => !value.of || matches(scope, one.object, value.of, one.traits)).length;
		if (event.kind === "life" && side(scope, value.by, event.who) && (value.history === "life-lost" ? event.amount < 0 : value.history === "life-gained" && event.amount > 0)) total += Math.abs(event.amount);
	}
	return total;
}

export function holds(scope: Scope, condition: Condition): boolean {
	if ("step" in condition) return scope.world.turn?.step === condition.step;
	if ("enteredThisTurn" in condition) {
		const began = scope.world.turn?.began;
		return began !== undefined && objects(scope, condition.enteredThisTurn).some((ref) => {
			const one = live(scope.world, ref);
			return one?.zone === "battlefield" && one.entered !== undefined && one.entered > began;
		});
	}
	if ("cast" in condition) {
		const one = objects(scope, condition.cast)[0], paid = one && scope.world.casting?.(one);
		return !!paid && (condition.from === undefined || paid.from === condition.from) && (condition.by === undefined || players(scope, condition.by).includes(paid.by)) &&
			(condition.paid === undefined || !!paid.additional?.includes(condition.paid)) &&
			(condition.alternative === undefined || paid.alternative === condition.alternative);
	}
	if ("amount" in condition) {
		const value = amount(scope, condition.amount);
		return (condition.atLeast === undefined || value >= amount(scope, condition.atLeast)) && (condition.atMost === undefined || value <= amount(scope, condition.atMost));
	}
	if ("bound" in condition) { const bound = scope.bound?.[condition.bound]; return !!bound && (bound.objects.length > 0 || bound.players.length > 0 || (bound.amount ?? 0) > 0); }
	if ("is" in condition) return objects(scope, condition.is, condition.lastKnown).some((one) => matches(scope, one, condition.matches));
	if ("all" in condition) return condition.all.every((part) => holds(scope, part));
	if ("any" in condition) return condition.any.some((part) => holds(scope, part));
	if ("turn" in condition) { const turn = scope.world.turn; return !!turn && (condition.turn === "self" ? turn.active === scope.controller : turn.active !== scope.controller); }
	return !holds(scope, condition.not);
}
