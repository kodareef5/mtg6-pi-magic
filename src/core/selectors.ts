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

export type Seen = Pick<Thing, "id" | "incarnation" | "zone" | "owner" | "controller" | "tapped" | "faceDown" | "counters" | "damage"> &
	Partial<Pick<Thing, "attached" | "token" | "ability" | "position" | "entered">> & { card?: string };
/** Something that happened this turn that cards count. All of it is public. */
export type Happened =
	| { kind: "cast"; by: SeatId; spell: Seen; traits?: Traits }
	| { kind: "activated"; by: SeatId; source: ObjectRef; basis: string }
	| { kind: "attacked"; by: SeatId; attackers: { object: Seen; traits?: Traits }[] }
	| { kind: "life"; who: SeatId; amount: number };
export type World = {
	objects: Seen[];
	read(object: Seen): Traits | undefined;
	players: { id: SeatId; life: number; name?: string }[];
	notes: Note[];
	combat: Combat | null;
	history: Happened[];
	/** The object as it is, or as it last was (608.2h). */
	lastKnown(ref: ObjectRef): { object: Seen; traits?: Traits } | undefined;
};
export type Chosen = ObjectRef | { player: SeatId };
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
	event?: { object?: Seen; objects?: Seen[]; player?: SeatId; source?: Seen };
	x?: number;
};

/** The table's own world. `read` overrides characteristics during the layer walk. */
export function tableWorld(table: Table, read?: (object: Seen) => Traits | undefined): World {
	const reader = read ?? ((object: Seen) => characteristics(table, object as Thing));
	let events: Happened[] | undefined;
	return {
		objects: [...table.things.values()], read: reader,
		players: playing(table).map((one) => ({ id: one.id, life: one.life, name: one.name })),
		notes: table.notes, combat: table.combat,
		get history() { return (events ??= happened(table)); },
		lastKnown(ref) {
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
		objects, read: (object) => (object as SeenObject).traits,
		players: (view.players ?? []).map((one) => ({ ...one, name: view.seats?.find((seat) => seat.id === one.id)?.name })), notes: view.notes ?? [],
		combat: view.combat ?? null, history: view.history ?? [],
		lastKnown(ref) { const object = seen.find((one) => one.id === ref.id && one.incarnation === ref.incarnation); return object ? { object, ...(object.traits ? { traits: object.traits } : {}) } : undefined; },
	};
}

/** This turn's public events cards count, from the receipts. Nothing is kept beside the log. */
export function happened(table: Table): Happened[] {
	const began = table.cursor.began[table.cursor.active] ?? 0, events: Happened[] = [];
	for (const receipt of table.log) {
		if ((receipt.clock ?? 0) <= began) continue;
		for (const change of receipt.changes) {
			if (change.do === "activate" && change.ability.timing !== "spell") events.push({ kind: "activated", by: change.ability.controller, source: change.ability.source, basis: change.ability.basis });
			if (change.do === "activate" && change.ability.timing === "spell") {
				const spell = receipt.after[change.what] ?? receipt.before[change.what];
				const traits = spell && characteristics(table, spell);
				if (spell) events.push({ kind: "cast", by: change.ability.controller, spell, ...(traits ? { traits } : {}) });
			}
			if (change.do === "attack") events.push({ kind: "attacked", by: table.cursor.active, attackers: change.attackers.map((one) => {
				const now = table.things.get(one.id);
				const traits = now?.incarnation === one.incarnation ? characteristics(table, now) : undefined;
				return { object: receipt.before[one.id] ?? now!, ...(traits ? { traits } : {}) };
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

/** The objects a ref names, as they are now. A target or binding that changed zones names nothing. */
export function objects(scope: Scope, ref: string | { top: number; of: string }): Seen[] {
	if (typeof ref !== "string") return players(scope, ref.of).flatMap((owner) => scope.world.objects.filter((one) => one.zone === "library" && one.owner === owner)
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).slice(0, ref.top));
	const [head, rest] = [ref.split(":")[0], ref.slice(ref.indexOf(":") + 1)];
	switch (head) {
		case "this": return scope.source ? [scope.source] : [];
		case "attached": { const at = scope.source?.attached && live(scope.world, scope.source.attached); return at ? [at] : []; }
		case "target": return (scope.targets?.[Number(rest)] ?? []).flatMap((chosen) => "id" in chosen && !scope.illegal?.includes(targetKey(chosen)) ? live(scope.world, chosen) ?? [] : []);
		case "bound": return (scope.bound?.[rest]?.objects ?? []).flatMap((one) => live(scope.world, one) ?? []);
		case "event": return rest === "object" ? (scope.event?.object ? [scope.event.object] : []) : rest === "objects" ? scope.event?.objects ?? [] : scope.event?.source ? [scope.event.source] : [];
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
		case "controller": return objects(scope, rest).map((one) => one.controller);
		case "owner": return objects(scope, rest).map((one) => one.owner);
		default: return [];
	}
}

const side = (scope: Scope, ref: string | undefined, seatId: SeatId) => ref === undefined || ref === "any" || players(scope, ref).includes(seatId);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An ability on the stack is an object (113.1c) but not a card: it has no types, words or abilities to match. */
const ability = (object: Seen): Traits | undefined => object.ability && !object.card && !object.token
	? { name: object.ability.claim, supertypes: [], types: [], subtypes: [], colors: [], words: [], registrations: [] } : undefined;

const FACELESS: Traits = { name: "", supertypes: [], types: [], subtypes: [], colors: [], words: [], registrations: [] };
export function matches(scope: Scope, object: Seen, selector: Selector, read = traitsOf(scope, object)): boolean {
	// A card this seat cannot see matches only a selector that asks nothing about what it is.
	const blind = !read && !object.ability && object.faceDown && !object.card;
	if (blind && (selector.name || selector.types || selector.subtypes || selector.supertypes || selector.words || selector.not || selector.power || selector.toughness)) return false;
	const traits = blind ? FACELESS : read ?? ability(object);
	if (!(selector.zones ?? ["battlefield"]).includes(object.zone as never) || !traits) return false;
	const holder = object.zone === "battlefield" || object.zone === "stack" ? object.controller : object.owner;
	if (!side(scope, selector.controller, holder) || !side(scope, selector.owner, object.owner)) return false;
	const subtype = (wanted: string) => traits.subtypes.some((one) => same(one, wanted)) || (!!traits.allCreatureTypes && creatureType(wanted));
	if (selector.name && !same(traits.name, selector.name)) return false;
	if (selector.types && !selector.types.some((type) => traits.types.includes(type))) return false;
	if (selector.subtypes && !selector.subtypes.some(subtype)) return false;
	if (selector.supertypes && !selector.supertypes.some((one) => traits.supertypes.includes(one))) return false;
	if (selector.words && !selector.words.every((word) => traits.words.includes(word))) return false;
	const not = selector.not;
	if (not && (not.types?.some((type) => traits.types.includes(type)) || not.subtypes?.some(subtype) ||
		not.supertypes?.some((one) => traits.supertypes.includes(one)) || not.words?.some((word) => traits.words.includes(word)))) return false;
	const within = (value: number | undefined, range?: { atLeast?: number; atMost?: number }) => !range ||
		(value !== undefined && (range.atLeast === undefined || value >= range.atLeast) && (range.atMost === undefined || value <= range.atMost));
	if (!within(traits.power, selector.power) || !within(traits.toughness, selector.toughness)) return false;
	if (selector.tapped !== undefined && selector.tapped !== object.tapped) return false;
	if (selector.token !== undefined && selector.token !== !!object.token) return false;
	const combat = scope.world.combat;
	if (selector.attacking !== undefined && selector.attacking !== !!combat?.attackers.some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.blocking !== undefined && selector.blocking !== !!combat?.blockers.some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.other && object.id === scope.source?.id) return false;
	if (selector.is && !objects(scope, selector.is).some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.attachedTo && !objects(scope, selector.attachedTo).some((one) => object.attached?.id === one.id && object.attached.incarnation === one.incarnation)) return false;
	if (selector.linked && !scope.world.notes.some((note) => note.kind === "link" && note.on.id === object.id && note.on.incarnation === object.incarnation &&
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
	if ("counters" in value) { const one = objects(scope, value.on)[0]; return one ? one.counters[value.counters] ?? 0 : 0; }
	if ("power" in value) { const one = objects(scope, value.power)[0]; return (one && traitsOf(scope, one)?.power) ?? 0; }
	if ("toughness" in value) { const one = objects(scope, value.toughness)[0]; return (one && traitsOf(scope, one)?.toughness) ?? 0; }
	if ("bound" in value) { const bound = scope.bound?.[value.bound]; return bound?.amount ?? (bound ? bound.objects.length + bound.players.length : 0); }
	if ("distinct" in value) return new Set(select(scope, value.among).flatMap((one) => traitsOf(scope, one)?.types ?? [])).size;
	if ("life" in value) return players(scope, value.life).reduce((sum, id) => sum + (scope.world.players.find((one) => one.id === id)?.life ?? 0), 0);
	if ("history" in value) return history(scope, value);
	if ("x" in value) return scope.x ?? 0;
	if ("sum" in value) return value.sum.reduce((total: number, part) => total + amount(scope, part), 0);
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
	if ("amount" in condition) {
		const value = amount(scope, condition.amount);
		return (condition.atLeast === undefined || value >= condition.atLeast) && (condition.atMost === undefined || value <= condition.atMost);
	}
	if ("bound" in condition) { const bound = scope.bound?.[condition.bound]; return !!bound && (bound.objects.length > 0 || bound.players.length > 0 || (bound.amount ?? 0) > 0); }
	if ("is" in condition) return objects(scope, condition.is).some((one) => matches(scope, one, condition.matches));
	if ("all" in condition) return condition.all.every((part) => holds(scope, part));
	if ("any" in condition) return condition.any.some((part) => holds(scope, part));
	return !holds(scope, condition.not);
}
