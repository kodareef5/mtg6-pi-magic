/** Paying a mana cost from floating mana and from mana abilities activated while paying (601.2g-h).
 * Sources are grouped only when everything this seat can see about them matches,
 * including its own labels and reserves. Payment is exact: a source that would
 * leave mana floating is not used. Keeping floating mana and tapping instead is
 * a different payment and is offered too.
 */
import { select } from "./query.ts";
import { intrinsic } from "./characteristics.ts";
import type { Mana } from "./table.ts";
import type { Frame, ObjectRef, SeatId } from "./types.ts";
import type { Amount, Registration, Selector } from "./language.ts";
import type { Change } from "./syntax.ts";
import { amount, matches, viewWorld } from "./selectors.ts";
import type { SeenObject } from "./work.ts";

/** The mana part of a locked cost. */
export type Price = { generic: number; colors: Mana["color"][] };
type Color = Mana["color"];
/** One mana ability activated while paying, with the claim it was accepted under. `sacrifice` is part of its cost, as a Treasure's is. */
export type Tap = { source: ObjectRef; colors: Color[]; claim: string; intrinsic?: true; spendOnly?: Selector; sacrifice?: true };
export type Funding = { paid: string[]; taps: Tap[] };
/** One way a source can produce mana, what it claims, and what that mana may pay for. */
type Yield = { colors: Color[]; claim: string; intrinsic?: true; spendOnly?: Selector; sacrifice?: true };
type Unit = { key: string; id: string; label: string; yields: Yield[]; pool?: Mana; source?: SeenObject };

const COLORS: Color[] = ["W", "U", "B", "R", "G"];
/** 302.6, read from what the seat sees: a creature that is not yet its controller's since its turn began, without haste. */
export const sick = (frame: Frame, object: SeenObject) => !!object.traits?.types.includes("creature") && !object.traits.words.includes("haste") &&
	(object.entered ?? 0) >= (frame.view.began ?? 0);
/** What the seat's plan holds: a held source is not interchangeable with a free one, so a payment can spare it. */
const heldBy = (frame: Frame): Set<string> => new Set((frame.view.work?.plan?.holds ?? []).flatMap((hold) => select(hold.objects, frame).map((object) => object.id)));
/** Two objects are interchangeable only when every fact this seat can see about them matches, and the plan holds both or neither. */
export const sameness = (frame: Frame, object: SeenObject): string => [
	object.card, object.zone, object.tapped, heldBy(frame).has(object.id), JSON.stringify(object.counters), object.damage, sick(frame, object), JSON.stringify(object.registrations ?? []),
	...(frame.view.notes ?? []).filter((note) => "on" in note && note.on.id === object.id && note.on.incarnation === object.incarnation).map((note) => JSON.stringify(note)).sort(),
].join("|");

/**
 * What a registered mana ability produces when its cost is tapping, or tapping
 * and sacrificing the source. `count` works out "for each Elf you control".
 */
export function produces(registration: Registration, count: (amount: Amount) => number): Yield[] {
	if (registration.kind !== "mana" || registration.cost.tap !== true) return [];
	const { tap: _, sacrifice, ...other } = registration.cost;
	if (Object.keys(other).length || (sacrifice !== undefined && sacrifice !== "this")) return [];
	const terms = { claim: registration.basis, ...(registration.spendOnly ? { spendOnly: registration.spendOnly } : {}), ...(sacrifice ? { sacrifice: true as const } : {}) };
	const times = count(registration.times ?? 1);
	const repeat = (colors: Color[]) => Array.from({ length: times }, () => colors).flat();
	if (registration.colors) return [{ colors: repeat(registration.colors as Color[]), ...terms }];
	return registration.any ? COLORS.map((color) => ({ colors: repeat(Array(registration.any).fill(color)), ...terms })) : [];
}

/**
 * The changes that activate these mana abilities and spend what they make and
 * `paid`, as part of a group whose earlier changes number `offset`.
 */
export function paying(funding: Funding, who: SeatId, clock: number, offset: number): Change[] {
	const changes: Change[] = [], made: string[] = [];
	for (const tap of funding.taps) {
		changes.push({ do: "tap", what: tap.source.id });
		if (tap.sacrifice) changes.push({ do: "move", what: tap.source.id, to: "graveyard", reason: "sacrifice" });
		tap.colors.forEach((_, unit) => made.push(`mana-${clock + 1}-${offset + changes.length}-${unit}`));
		changes.push({ do: "add-mana", who, colors: tap.colors, ...(tap.spendOnly ? { spendOnly: tap.spendOnly } : {}) });
	}
	if (funding.paid.length || made.length) changes.push({ do: "spend-mana", who, ids: [...funding.paid, ...made] });
	return changes;
}

/** Untapped sources this seat could tap for mana now: basic land types (305.6) and registered mana abilities. */
function manaSources(frame: Frame, except: ReadonlySet<string>): Unit[] {
	const units: Unit[] = [];
	for (const object of select({ zones: ["battlefield"], controller: "self", tapped: false }, frame)) {
		if (except.has(object.id) || sick(frame, object)) continue;
		const scope = { world: viewWorld(frame.view), controller: frame.seat, source: object };
		const yields = [
			...intrinsic(object.traits).map((color): Yield => ({ colors: [color], claim: `Tap ${object.card} for mana (basic land type)`, intrinsic: true })),
			...(object.traits?.registrations ?? []).flatMap((registration) => produces(registration, (value) => amount(scope, value))),
		];
		// A source whose abilities make different amounts is one unit per amount; the walk uses an object once.
		for (const size of [...new Set(yields.map((one) => one.colors.length))]) {
			const sized = yields.filter((one) => one.colors.length === size);
			units.push({ key: `${sameness(frame, object)}|${JSON.stringify(sized.map((one) => one.colors))}`, id: object.id, source: object, yields: sized,
				label: `tap ${object.card} (${object.id})` });
		}
	}
	return units;
}

/**
 * Every distinct way to pay exactly, from floating mana, tapped sources, or both.
 * `spending` is the spell as it will be on the stack, or an activation's source
 * in its actual zone. Restricted mana is used only when it matches.
 */
export function fundings(frame: Frame, cost: Price, except: ReadonlySet<string> = new Set(), spending?: SeenObject): { funding: Funding; shows: string }[] {
	const allowed = (spendOnly?: Selector) => !spendOnly || (!!spending && matches({ world: viewWorld(frame.view), controller: frame.seat, source: spending }, spending, spendOnly, spending.traits));
	const pool = (frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? []).filter((mana) => allowed(mana.spendOnly))
		.map((mana): Unit => ({ key: `pool|${mana.color}|${!!mana.persists}|${JSON.stringify(mana.spendOnly ?? null)}`, id: mana.id, pool: mana, yields: [{ colors: [mana.color], claim: "floating mana" }],
			label: `{${mana.color}} (${mana.id}, ${mana.persists ? "persists" : "expires at step end"}${mana.spendOnly ? ", restricted" : ""})` }));
	const sources = manaSources(frame, except).map((unit) => ({ ...unit, yields: unit.yields.filter((one) => allowed(one.spendOnly)) })).filter((unit) => unit.yields.length);
	return exact([...pool, ...sources], cost).map((units) => {
		const made = cover(units, cost)!;
		return {
			funding: { paid: units.flatMap((unit) => unit.pool ? [unit.id] : []),
				taps: units.flatMap((unit) => unit.source ? [{ source: { id: unit.source.id, incarnation: unit.source.incarnation }, colors: made.get(unit.id)!.colors,
					claim: made.get(unit.id)!.claim, ...(made.get(unit.id)!.intrinsic ? { intrinsic: true as const } : {}), ...(made.get(unit.id)!.sacrifice ? { sacrifice: true as const } : {}),
					...(made.get(unit.id)!.spendOnly ? { spendOnly: made.get(unit.id)!.spendOnly! } : {}) }] : []) },
			shows: units.length ? `Pay with ${units.map((unit) => unit.source ? `${unit.label}${made.get(unit.id)!.sacrifice ? " and sacrifice it" : ""} for ${made.get(unit.id)!.colors.join("")}` : unit.label).join(", ")}.` : "No mana is spent.",
		};
	});
}

/**
 * Each untapped source this seat could tap now and the ways it makes mana: the
 * same reading a payment uses, for a planner to count with. A mana ability with
 * a cost beyond tapping and sacrificing the source is not read here, as it is
 * not read when paying.
 */
export function sources(frame: Frame): { object: SeenObject; yields: Omit<Yield, "claim" | "intrinsic">[] }[] {
	const found = new Map<string, { object: SeenObject; yields: Omit<Yield, "claim" | "intrinsic">[] }>();
	for (const unit of manaSources(frame, new Set())) {
		const entry = found.get(unit.id) ?? { object: unit.source!, yields: [] };
		entry.yields.push(...unit.yields.map(({ colors, spendOnly, sacrifice }) => ({ colors, ...(spendOnly ? { spendOnly } : {}), ...(sacrifice ? { sacrifice } : {}) })));
		found.set(unit.id, entry);
	}
	return [...found.values()];
}

/** The most mana this seat could make now, floating and from untapped sources: an upper bound for X. */
export function capacity(frame: Frame): number {
	const pool = frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana.length ?? 0;
	const most = new Map<string, number>();
	for (const unit of manaSources(frame, new Set())) most.set(unit.id, Math.max(most.get(unit.id) ?? 0, ...unit.yields.map((one) => one.colors.length)));
	return pool + [...most.values()].reduce((sum, count) => sum + count, 0);
}

function exact(units: Unit[], cost: Price): Unit[][] {
	const groups = new Map<string, Unit[]>();
	for (const unit of [...units].sort((a, b) => a.id.localeCompare(b.id))) groups.set(unit.key, [...(groups.get(unit.key) ?? []), unit]);
	const buckets = [...groups.values()], total = cost.generic + cost.colors.length, found: Unit[][] = [];
	const walk = (at: number, chosen: Unit[], mana: number) => {
		if (mana === total) { if (new Set(chosen.map((unit) => unit.id)).size === chosen.length && cover(chosen, cost)) found.push(chosen); return; }
		const group = buckets[at];
		if (!group || mana > total) return;
		for (let count = 0; count <= group.length; count++) {
			const added = group.slice(0, count).reduce((sum, unit) => sum + unit.yields[0]!.colors.length, 0);
			if (mana + added > total) break;
			walk(at + 1, [...chosen, ...group.slice(0, count)], mana + added);
		}
	};
	walk(0, [], 0);
	return found;
}

/** Pick one yield per unit so the colored symbols are met. */
function cover(units: Unit[], cost: Price): Map<string, Yield> | null {
	const pick = (at: number, chosen: Map<string, Yield>): Map<string, Yield> | null => {
		if (at === units.length) return covers([...chosen.values()].flatMap((one) => one.colors), cost) ? chosen : null;
		for (const option of units[at]!.yields) {
			const result = pick(at + 1, new Map([...chosen, [units[at]!.id, option]]));
			if (result) return result;
		}
		return null;
	};
	return pick(0, new Map());
}

/** The colors a funding produces and spends, for checking a recorded payment. */
export const covers = (colors: Color[], cost: Price): boolean => colors.length === cost.generic + cost.colors.length &&
	cost.colors.every((color) => colors.filter((one) => one === color).length >= cost.colors.filter((wanted) => wanted === color).length);
