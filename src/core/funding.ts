/** Paying a mana cost (601.2g-h): floating mana, and mana abilities activated during payment.
 * Units group only when every fact this seat can see about them matches, including
 * its own labels and reserves, so a menu never merges two sources the seat could
 * tell apart. Payment is exact; a source that would leave mana floating is not used.
 */
import { select } from "./agenda.ts";
import { intrinsicMana, isCreature } from "./printed.ts";
import type { Mana } from "./table.ts";
import type { Frame, ObjectRef } from "./types.ts";
import type { Procedure } from "./work-language.ts";
import type { SeenObject } from "./work.ts";

export type Cost = NonNullable<Procedure["cost"]>;
type Color = Mana["color"];
/** One mana ability activated while paying. Its claim is the accepted meaning, not a certification. */
export type Tap = { source: ObjectRef; colors: Color[]; claim: string; intrinsic?: true };
export type Funding = { paid: string[]; taps: Tap[] };
type Unit = { key: string; id: string; label: string; yields: Color[][]; pool?: Mana; source?: SeenObject; claim?: string; intrinsic?: true };

const sick = (frame: Frame, object: SeenObject) => isCreature(frame.view.printed?.[object.card ?? ""]) && (object.entered ?? 0) >= (frame.view.began ?? 0);
/** Two objects are interchangeable only when every fact this seat can see about them matches. */
export const sameness = (frame: Frame, object: SeenObject): string => [
	object.card, object.zone, object.tapped, JSON.stringify(object.counters), object.damage, sick(frame, object),
	...(frame.view.work?.labels ?? []).filter((label) => label.object.id === object.id && label.object.incarnation === object.incarnation).map((label) => label.role).sort(),
	...(frame.view.work?.draft?.reserves ?? []).some((reserve) => reserve.object.id === object.id && reserve.object.incarnation === object.incarnation) ? ["reserved"] : [],
].join("|");

/** Untapped sources this seat could tap for mana now, by printed basic type or accepted interpretation. */
export function manaSources(frame: Frame, except?: string): Unit[] {
	const mark = (object: SeenObject) => sameness(frame, object);
	const units = new Map<string, Unit>();
	for (const object of select({ zones: ["battlefield"], controller: "self", tapped: false }, frame)) {
		const colors = object.id === except || !object.card ? [] : intrinsicMana(frame.view.printed?.[object.card]);
		if (colors.length) units.set(object.id, { key: `${mark(object)}|${colors}`, id: object.id, source: object, claim: `Tap ${object.card} for mana (basic land type)`, intrinsic: true,
			label: `tap ${object.card} (${object.id})`, yields: colors.map((color) => [color]) });
	}
	const declared = Object.values(frame.view.support ?? {}).flatMap((line) => line.status === "supported" ? line.interpretations : []);
	for (const { procedure } of declared) {
		const terms = procedure.cost;
		if (procedure.timing !== "mana" || !terms?.tap || terms.generic || terms.colors.length) continue;
		if (!procedure.instructions.length || procedure.instructions.some((instruction) => instruction.do !== "mana" || instruction.who !== "self")) continue;
		const colors = procedure.instructions.flatMap((instruction) => instruction.do === "mana" ? instruction.colors as Color[] : []);
		for (const object of select(procedure.source, frame)) {
			if (object.zone !== "battlefield" || object.controller !== frame.seat || object.tapped || object.id === except || sick(frame, object) || units.has(object.id)) continue;
			units.set(object.id, { key: `${mark(object)}|${colors}`, id: object.id, source: object, claim: procedure.claim,
				label: `tap ${object.card} (${object.id}) for ${colors.join("")}`, yields: [colors] });
		}
	}
	return [...units.values()];
}

/** Every distinct way to pay exactly. Floating mana that covers the cost is used before tapping more. */
export function fundings(frame: Frame, cost: Cost, except?: string): { funding: Funding; shows: string }[] {
	const pool = (frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? []).filter((mana) => !mana.spendOnly)
		.map((mana): Unit => ({ key: `pool|${mana.color}|${!!mana.persists}`, id: mana.id, pool: mana, yields: [[mana.color]],
			label: `{${mana.color}} (${mana.id}, ${mana.persists ? "persists" : "expires at step end"})` }));
	const fromPool = exact(pool, cost);
	return (fromPool.length ? fromPool : exact([...pool, ...manaSources(frame, except)], cost)).map((units) => {
		const made = cover(units, cost)!;
		return {
			funding: { paid: units.flatMap((unit) => unit.pool ? [unit.id] : []),
				taps: units.flatMap((unit) => unit.source ? [{ source: { id: unit.source.id, incarnation: unit.source.incarnation }, colors: made.get(unit.id)!, claim: unit.claim!, ...(unit.intrinsic ? { intrinsic: true as const } : {}) }] : []) },
			shows: units.length ? `Pay with ${units.map((unit) => unit.label).join(", ")}.` : "No mana is spent.",
		};
	});
}

function exact(units: Unit[], cost: Cost): Unit[][] {
	const groups = new Map<string, Unit[]>();
	for (const unit of [...units].sort((a, b) => a.id.localeCompare(b.id))) groups.set(unit.key, [...(groups.get(unit.key) ?? []), unit]);
	const buckets = [...groups.values()], total = cost.generic + cost.colors.length, found: Unit[][] = [];
	const walk = (at: number, chosen: Unit[], mana: number) => {
		if (mana === total) { if (cover(chosen, cost)) found.push(chosen); return; }
		const group = buckets[at];
		if (!group || mana > total) return;
		for (let count = 0; count <= group.length; count++) {
			const added = group.slice(0, count).reduce((sum, unit) => sum + unit.yields[0]!.length, 0);
			if (mana + added > total) break;
			walk(at + 1, [...chosen, ...group.slice(0, count)], mana + added);
		}
	};
	walk(0, [], 0);
	return found;
}

/** Pick one yield per unit so the colored symbols are met. Returns each unit's produced colors. */
function cover(units: Unit[], cost: Cost): Map<string, Color[]> | null {
	const pick = (at: number, chosen: Map<string, Color[]>): Map<string, Color[]> | null => {
		if (at === units.length) {
			const made = [...chosen.values()].flat();
			return cost.colors.every((color) => made.filter((one) => one === color).length >= cost.colors.filter((wanted) => wanted === color).length) ? chosen : null;
		}
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
