/** Saga lore, chapter thresholds and the final sacrifice (714). Chapter meaning
 * comes from source-backed registrations, not from reading printed prose. */
import { characteristics } from "./characteristics.ts";
import { cardsIn, type Table, type Thing, type Trigger } from "./table.ts";
import type { Registration } from "./language.ts";

export function chapters(table: Table, object: Thing): Extract<Registration, { kind: "chapter" }>[] {
	const traits = characteristics(table, object);
	return traits?.subtypes.includes("Saga") ? traits.registrations.filter((one) => one.kind === "chapter") : [];
}

/** One trigger for each crossed number, including counters placed during entry. */
export function chapterTriggers(table: Table, before: Record<string, Thing>, born: ReadonlySet<string> = new Set()): Trigger[] {
	const found: Trigger[] = [];
	for (const id of new Set([...Object.keys(before), ...born])) {
		const was = before[id], object = table.things.get(id);
		if (!object || object.zone !== "battlefield") continue;
		const prior = was?.zone === "battlefield" && was.incarnation === object.incarnation ? was.counters.lore ?? 0 : 0;
		const current = object.counters.lore ?? 0;
		if (current <= prior) continue;
		for (const registration of chapters(table, object)) for (const chapter of registration.numbers) {
			if (chapter <= prior || chapter > current) continue;
			found.push({ id: `chapter-${table.cursor.clock + 1}-${found.length}`, chapter, controller: object.controller,
				source: { id: object.id, incarnation: object.incarnation }, basis: registration.basis,
				effect: structuredClone(registration.effect), event: { object: { id: object.id, incarnation: object.incarnation } }, turn: table.cursor.turn });
		}
	}
	return found;
}

/** A chapter waiting to go on the stack also prevents the final sacrifice. */
export function completedSaga(table: Table, object: Thing): boolean {
	const numbers = chapters(table, object).flatMap((one) => one.numbers);
	if (!numbers.length || (object.counters.lore ?? 0) < Math.max(...numbers)) return false;
	const same = (source: { id: string; incarnation: number }) => source.id === object.id && source.incarnation === object.incarnation;
	return !table.waiting.some((trigger) => trigger.chapter !== undefined && same(trigger.source)) &&
		!cardsIn(table, "stack").some((one) => one.ability?.trigger?.chapter !== undefined && same(one.ability.source));
}
