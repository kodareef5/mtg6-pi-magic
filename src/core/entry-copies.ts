/** Copy replacements choose from the battlefield before the entire entry group.
 * The choice freezes copiable values; later entry terms read that new base. */
import type { Table } from "./table.ts";
import type { Entry } from "./entry-payments.ts";
import type { Pending } from "./moves.ts";
import { tokenObject } from "./entry.ts";
import { activeFaces } from "./faces.ts";
import { holds, matches, tableWorld } from "./selectors.ts";
import { copiable } from "./copies.ts";
import { characteristics, creatureType } from "./characteristics.ts";
import type { Registration } from "./language.ts";

const hasCopy = (terms?: Registration[]): boolean => !!terms?.some(one => one.kind === "enters" && one.copy ||
	one.kind === "continuous" && hasCopy(one.change.registers));

export function entryCopy(table: Table, entry: Entry): Pending | undefined {
	if (entry.blocked) return { situation: "replacement-order", seat: entry.blocked.who,
		question: "Finish the chosen entry copy.", moves: [], blocked: entry.blocked.reason };
	// Most entries have no copy term. Only walk a hypothetical battlefield when
	// an accepted ability could supply one, including grants from other sources.
	const granted = [...table.things.values()].some(one => one.zone === "battlefield" &&
		[one.registrations, one.token?.registers, one.copied?.spec.registers].some(hasCopy)) ||
		table.notes.some(note => note.kind === "register" ? hasCopy([note.registration]) : note.kind === "label" && hasCopy(note.change?.registers));
	for (const [index, change] of entry.changes.entries()) {
		if (change.do !== "token" && (change.do !== "move" || change.to !== "battlefield")) continue;
		if (!granted && !hasCopy(change.do === "token" ? change.spec.registers : change.copied?.spec.registers ?? change.registers)) continue;
		const object = change.do === "token" ? tokenObject(change, table.cursor.clock + 1) : table.things.get(change.what)!;
		const who = change.controller ?? object.owner;
		const source = { ...object, zone: "battlefield" as const, controller: who,
			faceDown: change.do === "move" && !!change.faceDown,
			face: change.do === "move" ? change.face ?? (object.zone === "stack" ? object.face ?? 0 : 0) : 0 as const,
			...(change.do === "move" ? { registrations: change.registers ?? [] } : {}),
			...(change.do === "move" && change.copied ? { copied: change.copied, registrations: [] } : {}) };
		const printed = object.card && table.printed[object.card], active = printed ? activeFaces(printed, source) : [0];
		const terms = characteristics(table, source)?.registrations;
		const world = tableWorld(table), scope = { world, controller: who, source };
		const copies = (terms ?? []).filter(one => one.kind === "enters" && one.copy && !one.affects &&
			(one.face === undefined || active.includes(one.face)) && !entry.copies?.[index]?.includes(one.basis) && (!one.if || holds(scope, one.if)));
		if (!copies.length) continue;
		if (copies.length > 1) return { situation: "replacement-order", seat: who, question: "Order the entry copy replacements.", moves: [],
			blocked: "Ordering multiple copy replacements on the same entering permanent is not implemented." };
		const registration = copies[0]!;
		if (registration.kind !== "enters" || !registration.copy) continue;
		const copy = registration.copy, name = object.card ?? object.token!.name;
		const selected = world.objects.filter(one => one.zone === "battlefield" && matches(scope, one, copy.of));
		const answered: Entry = { ...entry, copies: { ...entry.copies, [index]: [...entry.copies?.[index] ?? [], registration.basis] } };
		const moves: Pending["moves"] = selected.map(one => {
			const result = copiable(table, one, "permanent"), next = structuredClone(answered);
			const added = copy.add?.creatureTypes ?? [];
			const invalid = added.filter(type => !creatureType(type));
			if ("blocked" in result || invalid.length) next.blocked = { who, reason: "blocked" in result ? result.blocked : `Unknown creature types in copy exception: ${invalid.join(", ")}.` };
			else {
				const spec = result.spec;
				if (spec.types.includes("creature") || spec.types.includes("kindred")) spec.subtypes = [...new Set([...(spec.subtypes ?? []), ...added])];
				if (copy.add?.words?.length) spec.words = [...new Set([...(spec.words ?? []), ...copy.add.words])];
				const move = next.changes[index]!;
				if (move.do === "token") move.spec = spec;
				else if (move.do === "move") { move.copied = { source: { id: one.id, incarnation: one.incarnation }, spec }; move.registers = []; }
			}
			return { option: { id: `entry:${index}:copy:${one.id}@${one.incarnation}`, label: `${name} enters as a copy of ${world.read(one)?.name ?? one.card ?? one.token?.name}`,
				objects: [{ id: one.id, incarnation: one.incarnation }], cards: [name], shows: registration.basis },
				changes: [{ do: "entry", entry: next }], reason: entry.reason };
		});
		if (copy.may || !selected.length) moves.push({ option: { id: `entry:${index}:copy:decline`, label: `${name} enters without this copy effect`, cards: [name], shows: registration.basis },
			changes: [{ do: "entry", entry: answered }], reason: entry.reason });
		return { situation: "replacement-order", seat: who, question: `Choose how ${name} enters. This copy choice does not target.`, moves };
	}
}
