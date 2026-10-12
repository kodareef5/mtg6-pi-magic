/** Paying a mana cost from floating mana and from mana abilities activated while paying (601.2g-h).
 * Sources are grouped only when everything this seat can see about them matches,
 * including its own labels and reserves. Payments spend the exact cost; modern
 * journals also retain unused source output. Keeping floating mana and tapping
 * instead is a different payment and is offered too.
 * Past 150 lines to keep enumeration and exact payment checks together.
 */
import { currentPlan, select } from "./query.ts";
import { intrinsic } from "./characteristics.ts";
import { activationRestrictions } from "./permits.ts";
import { manaDuration, type Mana } from "./table.ts";
import type { Frame, ObjectRef, SeatId } from "./types.ts";
import type { Registration, Selector } from "./language.ts";
import type { Change, Zone } from "./syntax.ts";
import { amount, chosenSelector, holds, matches, viewWorld, type Scope } from "./selectors.ts";
import type { SeenObject } from "./work.ts";
import { tapsSource, tapChoices } from "./tap-costs.ts";

/** The mana part of a locked cost. */
export type Price = { generic: number; colors: Mana["color"][]; life?: number };
type Color = Mana["color"];
/** One mana ability activated while paying, with the claim it was accepted under. `sacrifice` is part of its cost, as a Treasure's is. */
export type Tap = { source: ObjectRef; tapped?: ObjectRef[]; colors: Color[]; produced?: Color[]; claim: string; intrinsic?: true; spendOnly?: Selector; spendFrom?: Zone[]; until?: Mana["until"]; spellWords?: string[]; sacrifice?: true; life?: number };
export type Funding = { paid: string[]; taps: Tap[] };
/** Every object tapped by a mana ability, including its selected additional costs. */
export const tapObjects = (tap: Pick<Tap, "source" | "tapped">): ObjectRef[] => [tap.source, ...tap.tapped ?? []];
/** One way a source can produce mana, what it claims, and what that mana may pay for. */
type Yield = Omit<Tap, "source">;
type Unit = { key: string; id: string; label: string; yields: Yield[]; pool?: Mana; source?: SeenObject };

/** `colors` is spent. Optional `produced` is the full output, including its remainder. */
export function manaSplit(tap: Pick<Tap, "colors" | "produced">): { paid: number[]; remaining: Color[] } {
	const output = tap.produced ?? tap.colors, paid: number[] = [];
	for (const color of tap.colors) {
		const at = output.findIndex((one, index) => one === color && !paid.includes(index));
		if (at < 0) throw new Error("Spent mana is not a subset of the source's output.");
		paid.push(at);
	}
	return { paid, remaining: output.filter((_, at) => !paid.includes(at)) };
}

/** Distinct nonempty spent multisets; identical output units have no separate choice. */
function partialOutputs(one: Yield, maximum: number): Yield[] {
	const found: Yield[] = [], colors = [...new Set(one.colors)];
	const choose = (at: number, picked: Color[]) => {
		if (at === colors.length) {
			if (picked.length) found.push(picked.length === one.colors.length ? one : { ...one, colors: picked, produced: one.colors });
			return;
		}
		const color = colors[at]!;
		for (let n = 0; n <= Math.min(maximum - picked.length, one.colors.filter(value => value === color).length); n++)
			choose(at + 1, [...picked, ...Array(n).fill(color)]);
	};
	choose(0, []); return found;
}

/** Only partial-output payments add a suffix, preserving all historical option ids. */
export const outputKey = (tap: Tap): string => (tap.produced ? `~made${tap.produced.join("")}~spent${tap.colors.join("")}` : "") +
	(tap.tapped?.length ? `~tap${tap.tapped.map(one => `${one.id}@${one.incarnation}`).join("+")}` : "");
export const outputLabel = (tap: Pick<Tap, "colors" | "produced">): string => tap.produced
	? `produce ${tap.produced.map(one => `{${one}}`).join("")}, spend ${tap.colors.map(one => `{${one}}`).join("")}, keep ${manaSplit(tap).remaining.map(one => `{${one}}`).join("")} floating`
	: tap.colors.map(one => `{${one}}`).join("");

const COLORS: Color[] = ["W", "U", "B", "R", "G"];
/** Color order is immaterial within one output; every mixed multiset remains a choice. */
export function colorChoices(count: number, combination = false): Color[][] {
	if (!combination) return COLORS.map(color => Array(count).fill(color));
	const choose = (left: number, from: number): Color[][] => left === 0 ? [[]]
		: COLORS.flatMap((color, at) => at < from ? [] : choose(left - 1, at).map(rest => [color, ...rest]));
	return choose(count, 0);
}
/** 302.6, read from what the seat sees: a creature that is not yet its controller's since its turn began, without haste. */
export const sick = (frame: Frame, object: SeenObject) => !!object.traits?.types.includes("creature") && !object.traits.words.includes("haste") &&
	(object.entered ?? 0) >= (frame.view.began ?? 0);
/** What the seat's plan holds: a held source is not interchangeable with a free one, so a payment can spare it. */
const heldBy = (frame: Frame): Set<string> => new Set((currentPlan(frame)?.holds ?? []).flatMap((hold) => select(hold.objects, frame).map((object) => object.id)));
/** Two objects are interchangeable only when every fact this seat can see about them matches, and the plan holds both or neither. */
export const sameness = (frame: Frame, object: SeenObject): string => [
	object.card, object.zone, object.tapped, heldBy(frame).has(object.id), JSON.stringify(object.counters), object.damage, sick(frame, object), JSON.stringify(object.registrations ?? []),
	JSON.stringify(object.choices),
	JSON.stringify(object.designations),
	...(frame.view.notes ?? []).filter((note) => "on" in note && note.on.id === object.id && note.on.incarnation === object.incarnation).map((note) => JSON.stringify(note)).sort(),
].join("|");

/**
 * What a registered mana ability produces with source and selected tap costs,
 * life or source sacrifice. The scope supplies conditions, counts and entry choices.
 */
export function produces(registration: Registration, scope: Scope): Yield[] {
	if (registration.kind !== "mana" || !tapsSource(registration.cost)) return [];
	if (scope.source && activationRestrictions(scope.world, scope.source, true).length) return [];
	if (registration.if && !holds(scope, registration.if)) return [];
	const { tap, sacrifice, life, ...other } = registration.cost;
	if (Object.keys(other).length || (sacrifice !== undefined && sacrifice !== "this")) return [];
	const selections = typeof tap === "object" ? tapChoices(scope, tap).map(chosen => ({ tapped: chosen.map(one => ({ id: one.id, incarnation: one.incarnation })) })) : [{}];
	const terms = { claim: registration.basis, ...manaTerms(registration, scope), ...(sacrifice ? { sacrifice: true as const } : {}), ...(life ? { life } : {}) };
	const times = amount(scope, registration.times ?? 1);
	const repeat = (colors: Color[]) => Array.from({ length: times }, () => colors).flat();
	const outputs = registration.colors ? [repeat(registration.colors as Color[])] : registration.any
		? colorChoices(registration.combination ? registration.any * times : registration.any, registration.combination).map(colors => registration.combination ? colors : repeat(colors)) : [];
	return selections.flatMap(selection => outputs.map(colors => ({ colors, ...terms, ...selection })));
}

/** Additional effects travel with the produced mana, independent of later source changes. */
export function manaTerms(terms: { spendOnly?: Selector; spendFrom?: readonly string[]; until?: string; spellWords?: string[] }, scope: Scope): Pick<Mana, "spendOnly" | "spendFrom" | "until" | "spellWords"> {
	return { ...(terms.spendOnly ? { spendOnly: chosenSelector(scope, terms.spendOnly) } : {}),
		...(terms.spendFrom ? { spendFrom: [...terms.spendFrom] as Zone[] } : {}),
		...(terms.until ? { until: terms.until as Mana["until"] } : {}), ...(terms.spellWords ? { spellWords: [...terms.spellWords] } : {}) };
}

/** The casting origin is supplied only for a proposed spell, never an activation or plot payment. */
export function spendable(terms: Pick<Mana, "spendOnly" | "spendFrom">, scope: Scope, spending?: SeenObject, from?: Zone, traits = spending?.traits): boolean {
	return (!terms.spendFrom || from !== undefined && terms.spendFrom.includes(from)) &&
		(!terms.spendOnly || !!spending && matches(scope, spending, terms.spendOnly, traits));
}

/** Only mana selected for this payment grants words; the rest of the pool grants nothing. */
export const spentWords = (funding: Funding, pool: Mana[]): string[] => [...new Set([
	...pool.filter((mana) => funding.paid.includes(mana.id)).flatMap((mana) => mana.spellWords ?? []),
	...funding.taps.flatMap((tap) => tap.spellWords ?? []),
])];

/**
 * The changes that activate these mana abilities and spend what they make and
 * `paid`, as part of a group whose earlier changes number `offset`.
 */
export function paying(funding: Funding, who: SeatId, clock: number, offset: number): Change[] {
	const changes: Change[] = [], made: string[] = [];
	for (const tap of funding.taps) {
		changes.push(...tapObjects(tap).map(one => ({ do: "tap" as const, what: one.id })));
		if (tap.life) changes.push({ do: "change-life", who, amount: -tap.life, reason: "cost-payment" });
		if (tap.sacrifice) changes.push({ do: "move", what: tap.source.id, to: "graveyard", reason: "sacrifice" });
		manaSplit(tap).paid.forEach(unit => made.push(`mana-${clock + 1}-${offset + changes.length}-${unit}`));
		changes.push({ do: "add-mana", who, colors: tap.produced ?? tap.colors, ...(tap.spendOnly ? { spendOnly: tap.spendOnly } : {}), ...(tap.spendFrom ? { spendFrom: tap.spendFrom } : {}), ...(tap.until ? { until: tap.until } : {}), ...(tap.spellWords ? { spellWords: tap.spellWords } : {}) });
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
		if (activationRestrictions(scope.world, object, true).length) continue;
		const life = frame.view.players?.find((one) => one.id === frame.seat)?.life ?? 0;
		const yields = [
			...intrinsic(object.traits).map((color): Yield => ({ colors: [color], claim: `Tap ${object.card} for mana (basic land type)`, intrinsic: true })),
			...(object.traits?.registrations ?? []).flatMap((registration) => produces(registration, scope)),
		].filter((one) => (one.life ?? 0) <= life && !one.tapped?.some(one => except.has(one.id)));
		// Different payment costs remain choices. The walk uses an object once.
		const costKey = (one: Yield) => JSON.stringify([one.colors.length, one.life ?? 0, !!one.sacrifice, one.spellWords, ...(one.tapped ? [one.tapped] : [])]);
		for (const size of [...new Set(yields.map(costKey))]) {
			const sized = yields.filter((one) => costKey(one) === size);
			units.push({ key: `${sameness(frame, object)}|${JSON.stringify(sized)}`, id: object.id, source: object, yields: sized,
				label: `tap ${object.card ?? object.token?.name} (${object.id})${sized[0]?.tapped?.length ? ` and ${sized[0].tapped.map(ref => {
					const one = frame.view.objects?.find(one => one.id === ref.id); return `${one?.card ?? one?.token?.name ?? ref.id} (${ref.id})`;
				}).join(", ")}` : ""}` });
		}
	}
	return units;
}

/**
 * The available payment resources, without enumerating combinations.
 * `spending` is the spell as it will be on the stack, or an activation's source
 * in its actual zone. Restricted mana is used only when it matches.
 */
export function paymentUnits(frame: Frame, except: ReadonlySet<string> = new Set(), spending?: SeenObject, from?: Zone, maximum = Infinity, leaving: ReadonlySet<string> = new Set()): Unit[] {
	const allowed = (terms: Pick<Mana, "spendOnly" | "spendFrom">) => spendable(terms, { world: viewWorld(frame.view), controller: frame.seat, source: spending }, spending, from);
	const pool = (frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? []).filter(allowed)
		.map((mana): Unit => ({ key: `pool|${mana.color}|${manaDuration(mana)}|${JSON.stringify(mana.spendOnly ?? null)}|${JSON.stringify(mana.spellWords ?? null)}${mana.spendFrom ? `|from:${mana.spendFrom.join(",")}` : ""}`, id: mana.id, pool: mana, yields: [{ colors: [mana.color], claim: "floating mana" }],
			label: `{${mana.color}} (${mana.id}, ${manaDuration(mana)}${mana.spendOnly ? ", restricted" : ""}${mana.spendFrom ? `, only spells cast from ${mana.spendFrom.join(" or ")}` : ""}${mana.spellWords?.length ? `, grants ${mana.spellWords.join(", ")}` : ""})` }));
	const sources = manaSources(frame, except).flatMap(unit => {
		const yields = unit.yields.filter(one => allowed(one) && !(one.sacrifice && leaving.has(unit.id)));
		if (!frame.view.excessMana || !yields.some(one => one.colors.length > 1)) return yields.length ? [{ ...unit, yields }] : [];
		const groups = new Map<string, Yield[]>();
		for (const one of yields.flatMap(one => partialOutputs(one, maximum))) {
			// The exact-payment forecast may pick any yield in a group only when it leaves the same mana and terms.
			const key = JSON.stringify([one.colors.length, manaSplit(one).remaining, one.life, one.sacrifice, one.spendOnly, one.spendFrom, one.until, one.spellWords, ...(one.tapped ? [one.tapped] : [])]);
			groups.set(key, [...groups.get(key) ?? [], one]);
		}
		return [...groups].map(([key, yields]) => ({ ...unit, key: `${unit.key}|remainder:${key}`, yields }));
	});
	// An otherwise identical land is not interchangeable when another ability
	// names its physical object as part of a selected tap cost.
	const shared = new Set(sources.flatMap(unit => unit.yields.flatMap(one => one.tapped?.map(one => one.id) ?? [])));
	return [...pool, ...sources.map(unit => ({ ...unit, key: unit.key + (leaving.has(unit.id) ? "|leaving" : "") + (shared.has(unit.id) ? `|shared:${unit.id}` : "") }))];
}

/** Historical complete payments, also used to check staged payment coverage. */
export function fundings(frame: Frame, cost: Price, except: ReadonlySet<string> = new Set(), spending?: SeenObject, from?: Zone): { funding: Funding; shows: string }[] {
	const life = (frame.view.players?.find((one) => one.id === frame.seat)?.life ?? 0) - (cost.life ?? 0);
	return exact(paymentUnits(frame, except, spending, from, cost.generic + cost.colors.length), cost, !!frame.view.excessMana).filter((units) => units.reduce((sum, unit) => sum + (unit.yields[0]!.life ?? 0), 0) <= life).map((units) => {
		const made = cover(units, cost)!;
		return {
			funding: { paid: units.flatMap((unit) => unit.pool ? [unit.id] : []),
				taps: units.flatMap((unit) => unit.source ? [{ source: { id: unit.source.id, incarnation: unit.source.incarnation }, colors: made.get(unit.id)!.colors,
					...(made.get(unit.id)!.tapped ? { tapped: made.get(unit.id)!.tapped! } : {}),
					claim: made.get(unit.id)!.claim, ...(made.get(unit.id)!.intrinsic ? { intrinsic: true as const } : {}), ...(made.get(unit.id)!.sacrifice ? { sacrifice: true as const } : {}),
					...(made.get(unit.id)!.produced ? { produced: made.get(unit.id)!.produced! } : {}),
					...(made.get(unit.id)!.life ? { life: made.get(unit.id)!.life! } : {}),
					...(made.get(unit.id)!.until ? { until: made.get(unit.id)!.until! } : {}),
					...(made.get(unit.id)!.spellWords ? { spellWords: made.get(unit.id)!.spellWords! } : {}),
					...(made.get(unit.id)!.spendFrom ? { spendFrom: made.get(unit.id)!.spendFrom! } : {}),
					...(made.get(unit.id)!.spendOnly ? { spendOnly: made.get(unit.id)!.spendOnly! } : {}) }] : []) },
			shows: units.length ? `Pay with ${units.map((unit) => unit.source ? `${unit.label}${made.get(unit.id)!.sacrifice ? " and sacrifice it" : ""}${made.get(unit.id)!.life ? ` and pay ${made.get(unit.id)!.life} life` : ""} for ${made.get(unit.id)!.produced ? outputLabel(made.get(unit.id)!) : made.get(unit.id)!.colors.join("")}` : unit.label).join(", ")}.` : "No mana is spent.",
		};
	});
}

/**
 * Each untapped source this seat could tap now and the ways it makes mana: the
 * same reading a payment uses, for a planner to count with. A mana ability with
 * a cost beyond source/selected taps, life and sacrificing the source is not read here, as it is
 * not read when paying.
 */
export function sources(frame: Frame): { object: SeenObject; yields: Omit<Yield, "claim" | "intrinsic">[] }[] {
	const found = new Map<string, { object: SeenObject; yields: Omit<Yield, "claim" | "intrinsic">[] }>();
	for (const unit of manaSources(frame, new Set())) {
		const entry = found.get(unit.id) ?? { object: unit.source!, yields: [] };
		entry.yields.push(...unit.yields.map(({ claim: _, intrinsic: __, ...terms }) => terms));
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

function exact(units: Unit[], cost: Price, distinct = false): Unit[][] {
	const groups = new Map<string, Unit[]>();
	for (const unit of [...units].sort((a, b) => a.id.localeCompare(b.id))) groups.set(unit.key, [...(groups.get(unit.key) ?? []), unit]);
	const buckets = [...groups.values()], total = cost.generic + cost.colors.length, found: Unit[][] = [];
	const walk = (at: number, chosen: Unit[], mana: number) => {
		if (mana === total) { if (new Set(chosen.map((unit) => unit.id)).size === chosen.length && cover(chosen, cost)) found.push(chosen); return; }
		const group = distinct ? buckets[at]?.filter(one => !chosen.some(used => used.id === one.id)) : buckets[at];
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
	const sources = new Set(units.filter(one => one.source).map(one => one.id));
	const pick = (at: number, chosen: Map<string, Yield>, tapped = new Set<string>()): Map<string, Yield> | null => {
		if (at === units.length) return covers([...chosen.values()].flatMap((one) => one.colors), cost) ? chosen : null;
		for (const option of units[at]!.yields) {
			if (option.tapped?.some(one => sources.has(one.id) || tapped.has(one.id))) continue;
			const result = pick(at + 1, new Map([...chosen, [units[at]!.id, option]]), new Set([...tapped, ...option.tapped?.map(one => one.id) ?? []]));
			if (result) return result;
		}
		return null;
	};
	return pick(0, new Map());
}

/** The colors a funding produces and spends, for checking a recorded payment. */
export const covers = (colors: Color[], cost: Price): boolean => colors.length === cost.generic + cost.colors.length &&
	cost.colors.every((color) => colors.filter((one) => one === color).length >= cost.colors.filter((wanted) => wanted === color).length);
