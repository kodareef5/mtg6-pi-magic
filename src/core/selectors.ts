/**
 * Reading the syntax against the table: which objects a ref or selector means,
 * what an amount is, whether a condition holds. docs/SYNTAX.md.
 *
 * Everything is worked out when it is asked for. A scope says whose ability it
 * is and what was announced, bound and triggered; a scope with a viewer sees only
 * what that seat has earned, which is how a plan's conditions are checked.
 * Past 150 lines because refs, selectors, amounts and conditions read each other.
 */
import { cardsIn, playing, seat, type Table, type Thing } from "./table.ts";
import type { Amount, Condition, Selector } from "./language.ts";
import { characteristics, creatureType, type Traits } from "./characteristics.ts";
import type { ObjectRef, SeatId } from "./types.ts";

export type Chosen = ObjectRef | { player: SeatId };
/** What an earlier instruction bound with `as`. */
export type Bound = { objects: ObjectRef[]; players: SeatId[]; amount?: number };
export type Scope = {
	table: Table;
	/** "You": the controller of the spell or ability. */
	controller: SeatId;
	/** "This". On the stack or gone, it is read as it last existed. */
	source?: Thing;
	targets?: Chosen[];
	bound?: Record<string, Bound>;
	event?: { object?: Thing; objects?: Thing[]; player?: SeatId; source?: Thing };
	x?: number;
	/** Only what this seat may see. */
	viewer?: SeatId;
	/** Characteristics during the layer walk; otherwise read fresh. */
	read?: (object: Thing) => Traits | undefined;
};

const traitsOf = (scope: Scope, object: Thing) => (scope.read ?? ((one: Thing) => characteristics(scope.table, one)))(object);
const live = (table: Table, ref: ObjectRef) => { const found = table.things.get(ref.id); return found && found.incarnation === ref.incarnation ? found : undefined; };
const PUBLIC = new Set(["battlefield", "graveyard", "stack", "exile", "command"]);
export const visibleTo = (object: Thing, viewer: SeatId) => !object.faceDown && (PUBLIC.has(object.zone) || (object.zone === "hand" && object.owner === viewer));

/** The objects a ref names, as they are now. A target or binding that changed zones names nothing. */
export function objects(scope: Scope, ref: string | { top: number; of: string }): Thing[] {
	if (typeof ref !== "string") return players(scope, ref.of).flatMap((owner) => cardsIn(scope.table, "library", owner).slice(0, ref.top));
	const [head, rest] = [ref.split(":")[0], ref.slice(ref.indexOf(":") + 1)];
	switch (head) {
		case "this": return scope.source ? [scope.source] : [];
		case "attached": { const at = scope.source?.attached && live(scope.table, scope.source.attached); return at ? [at] : []; }
		case "target": { const chosen = scope.targets?.[Number(rest)]; const found = chosen && "id" in chosen ? live(scope.table, chosen) : undefined; return found ? [found] : []; }
		case "bound": return (scope.bound?.[rest]?.objects ?? []).flatMap((one) => live(scope.table, one) ?? []);
		case "event": return rest === "object" ? (scope.event?.object ? [scope.event.object] : []) : rest === "objects" ? scope.event?.objects ?? [] : scope.event?.source ? [scope.event.source] : [];
		default: return [];
	}
}

/** The players a ref names. */
export function players(scope: Scope, ref: string): SeatId[] {
	const others = playing(scope.table).map((one) => one.id).filter((id) => id !== scope.controller);
	const [head, rest] = [ref.split(":")[0], ref.slice(ref.indexOf(":") + 1)];
	switch (head) {
		case "you": return [scope.controller];
		case "opponent": return others;
		case "each-player": return playing(scope.table).map((one) => one.id);
		case "event": return scope.event?.player === undefined ? [] : [scope.event.player];
		case "target": { const chosen = scope.targets?.[Number(rest)]; return chosen && "player" in chosen ? [chosen.player] : []; }
		case "bound": return scope.bound?.[rest]?.players ?? [];
		case "controller": return objects(scope, rest).map((one) => one.controller);
		case "owner": return objects(scope, rest).map((one) => one.owner);
		default: return [];
	}
}

const side = (scope: Scope, ref: string | undefined, seatId: SeatId) => ref === undefined || ref === "any" || players(scope, ref).includes(seatId);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function matches(scope: Scope, object: Thing, selector: Selector): boolean {
	if (!(selector.zones ?? ["battlefield"]).includes(object.zone as never)) return false;
	if (scope.viewer !== undefined && !visibleTo(object, scope.viewer)) return false;
	const traits = traitsOf(scope, object);
	if (!traits) return false;
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
	if (selector.attacking !== undefined && selector.attacking !== !!scope.table.combat?.attackers.some((one) => one.id === object.id)) return false;
	if (selector.blocking !== undefined && selector.blocking !== !!scope.table.combat?.blockers.some((one) => one.id === object.id)) return false;
	if (selector.other && object.id === scope.source?.id) return false;
	if (selector.is && !objects(scope, selector.is).some((one) => one.id === object.id && one.incarnation === object.incarnation)) return false;
	if (selector.attachedTo && !objects(scope, selector.attachedTo).some((one) => object.attached?.id === one.id && object.attached.incarnation === one.incarnation)) return false;
	if (selector.linked && !scope.table.notes.some((note) => note.kind === "link" && note.on.id === object.id && note.on.incarnation === object.incarnation &&
		note.source.id === scope.source?.id && note.source.incarnation === scope.source.incarnation)) return false;
	if (selector.targeting && !(object.zone === "stack" && (object.ability?.target ? [object.ability.target] : []).some((chosen) => "id" in chosen &&
		!!live(scope.table, chosen) && matches(scope, live(scope.table, chosen)!, selector.targeting!)))) return false;
	return true;
}

/** Every object a selector means, in id order. */
export const select = (scope: Scope, selector: Selector): Thing[] =>
	[...scope.table.things.values()].filter((object) => matches(scope, object, selector)).sort((a, b) => a.id.localeCompare(b.id));

export function amount(scope: Scope, value: Amount): number {
	if (typeof value === "number") return value;
	if ("count" in value) return select(scope, value.count).length;
	if ("counters" in value) return objects(scope, value.on)[0]?.counters[value.counters] ?? 0;
	if ("power" in value) { const one = objects(scope, value.power)[0]; return (one && traitsOf(scope, one)?.power) ?? 0; }
	if ("toughness" in value) { const one = objects(scope, value.toughness)[0]; return (one && traitsOf(scope, one)?.toughness) ?? 0; }
	if ("bound" in value) { const bound = scope.bound?.[value.bound]; return bound?.amount ?? (bound ? bound.objects.length + bound.players.length : 0); }
	if ("distinct" in value) return new Set(select(scope, value.among).flatMap((one) => traitsOf(scope, one)?.types ?? [])).size;
	if ("life" in value) return players(scope, value.life).reduce((sum, id) => sum + seat(scope.table, id).life, 0);
	if ("history" in value) return history(scope, value);
	if ("x" in value) return scope.x ?? 0;
	if ("sum" in value) return value.sum.reduce((total: number, part) => total + amount(scope, part), 0);
	return -amount(scope, value.negate);
}

/** This turn so far, from the receipts. Nothing here is a counter kept beside the log. */
function history(scope: Scope, value: Extract<Amount, { history: string }>): number {
	const began = scope.table.cursor.began[scope.table.cursor.active] ?? 0;
	let total = 0;
	for (const receipt of scope.table.log) {
		if ((receipt.clock ?? 0) <= began) continue;
		for (const change of receipt.changes) {
			if (value.history === "cast" && change.do === "activate" && change.ability.timing === "spell" && side(scope, value.by, change.ability.controller)) {
				const spell = receipt.after[change.what] ?? receipt.before[change.what];
				if (spell && (!value.of || matches({ ...scope, viewer: undefined }, spell, value.of))) total += 1;
			}
			if (value.history === "attacked" && change.do === "attack") total += change.attackers.filter((one) => {
				const was = receipt.before[one.id];
				return !value.of || (was && matches(scope, was, value.of));
			}).length;
			if (value.history === "life-lost" && change.do === "damage" && "player" in change.target && side(scope, value.by, change.target.player)) total += change.amount;
			if (change.do === "change-life" && side(scope, value.by, change.who) &&
				(value.history === "life-lost" ? change.amount < 0 : value.history === "life-gained" && change.amount > 0)) total += Math.abs(change.amount);
		}
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
