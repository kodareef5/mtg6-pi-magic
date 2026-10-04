/** Paying a mana cost from floating mana and from mana abilities activated while paying (601.2g-h).
 * Sources are grouped only when everything this seat can see about them matches,
 * including its own labels and reserves. Payment is exact: a source that would
 * leave mana floating is not used. Keeping floating mana and tapping instead is
 * a different payment and is offered too.
 */
import { select } from "./agenda.ts";
import { intrinsic } from "./characteristics.ts";
import type { Mana } from "./table.ts";
import type { Frame, ObjectRef } from "./types.ts";
import type { Procedure } from "./work-language.ts";
import type { Registration } from "./language.ts";
import type { SeenObject } from "./work.ts";

export type Cost = NonNullable<Procedure["cost"]>;
type Color = Mana["color"];
/** One mana ability activated while paying, with the claim it was accepted under. */
export type Tap = { source: ObjectRef; colors: Color[]; claim: string; intrinsic?: true };
export type Funding = { paid: string[]; taps: Tap[] };
/** One way a source can produce mana, and what it claims. */
type Yield = { colors: Color[]; claim: string; intrinsic?: true };
type Unit = { key: string; id: string; label: string; yields: Yield[]; pool?: Mana; source?: SeenObject };

const COLORS: Color[] = ["W", "U", "B", "R", "G"];
/** 302.6, read from what the seat sees: a creature that is not yet its controller's since its turn began, without haste. */
export const sick = (frame: Frame, object: SeenObject) => !!object.traits?.types.includes("creature") && !object.traits.words.includes("haste") &&
	(object.entered ?? 0) >= (frame.view.began ?? 0);
/** Two objects are interchangeable only when every fact this seat can see about them matches. */
export const sameness = (frame: Frame, object: SeenObject): string => [
	object.card, object.zone, object.tapped, JSON.stringify(object.counters), object.damage, sick(frame, object), JSON.stringify(object.registrations ?? []),
	...(frame.view.work?.labels ?? []).filter((label) => label.object.id === object.id && label.object.incarnation === object.incarnation).map((label) => label.role).sort(),
	...(frame.view.work?.draft?.reserves ?? []).some((reserve) => reserve.object.id === object.id && reserve.object.incarnation === object.incarnation) ? ["reserved"] : [],
].join("|");

/**
 * What a registered mana ability produces when its only cost is tapping. Other
 * costs, counted amounts and spend restrictions are not paid this way yet.
 */
export function produces(registration: Registration): Yield[] {
	if (registration.kind !== "mana" || registration.cost.tap !== true || Object.keys(registration.cost).length !== 1 || registration.spendOnly) return [];
	const times = registration.times ?? 1;
	if (typeof times !== "number") return [];
	const repeat = (colors: Color[]) => Array.from({ length: times }, () => colors).flat();
	if (registration.colors) return [{ colors: repeat(registration.colors as Color[]), claim: registration.basis }];
	return registration.any ? COLORS.map((color) => ({ colors: repeat(Array(registration.any).fill(color)), claim: registration.basis })) : [];
}

/** Untapped sources this seat could tap for mana now: basic land types (305.6) and registered mana abilities. */
function manaSources(frame: Frame, except?: string): Unit[] {
	const units: Unit[] = [];
	for (const object of select({ zones: ["battlefield"], controller: "self", tapped: false }, frame)) {
		if (object.id === except || sick(frame, object)) continue;
		const yields = [
			...intrinsic(object.traits).map((color): Yield => ({ colors: [color], claim: `Tap ${object.card} for mana (basic land type)`, intrinsic: true })),
			...(object.traits?.registrations ?? []).flatMap(produces),
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

/** Every distinct way to pay exactly, from floating mana, tapped sources, or both. */
export function fundings(frame: Frame, cost: Cost, except?: string): { funding: Funding; shows: string }[] {
	const pool = (frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? []).filter((mana) => !mana.spendOnly)
		.map((mana): Unit => ({ key: `pool|${mana.color}|${!!mana.persists}`, id: mana.id, pool: mana, yields: [{ colors: [mana.color], claim: "floating mana" }],
			label: `{${mana.color}} (${mana.id}, ${mana.persists ? "persists" : "expires at step end"})` }));
	return exact([...pool, ...manaSources(frame, except)], cost).map((units) => {
		const made = cover(units, cost)!;
		return {
			funding: { paid: units.flatMap((unit) => unit.pool ? [unit.id] : []),
				taps: units.flatMap((unit) => unit.source ? [{ source: { id: unit.source.id, incarnation: unit.source.incarnation }, colors: made.get(unit.id)!.colors,
					claim: made.get(unit.id)!.claim, ...(made.get(unit.id)!.intrinsic ? { intrinsic: true as const } : {}) }] : []) },
			shows: units.length ? `Pay with ${units.map((unit) => unit.source ? `${unit.label} for ${made.get(unit.id)!.colors.join("")}` : unit.label).join(", ")}.` : "No mana is spent.",
		};
	});
}

function exact(units: Unit[], cost: Cost): Unit[][] {
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
function cover(units: Unit[], cost: Cost): Map<string, Yield> | null {
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
export const covers = (colors: Color[], cost: Cost): boolean => colors.length === cost.generic + cost.colors.length &&
	cost.colors.every((color) => colors.filter((one) => one === color).length >= cost.colors.filter((wanted) => wanted === color).length);
