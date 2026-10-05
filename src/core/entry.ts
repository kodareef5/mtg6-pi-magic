/** A permanent registers its seat's package for its name as it enters, by whatever route. */
import { thing, type Table, type ObjectId, type Thing } from "./table.ts";
import { characteristics } from "./characteristics.ts";
import { amount, holds, matches, tableWorld, type Scope } from "./selectors.ts";
import type { Registration } from "./language.ts";
import type { Change } from "./syntax.ts";
import type { SeatId } from "./types.ts";

/**
 * Attach packages to the moves onto the battlefield in one group. Live, they come
 * from the controller's work; on replay, from what the ledger row froze, and a
 * permanent the row does not name registered nothing.
 */
export function attach(table: Table, changes: Change[], frozen?: Record<ObjectId, Registration[]>): Record<ObjectId, Registration[]> {
	const used: Record<ObjectId, Registration[]> = {};
	for (const change of changes) {
		if (change.do !== "move" || change.to !== "battlefield") continue;
		const object = thing(table, change.what);
		// It enters under the move's controller, or its owner's: that seat's package applies.
		const registers = frozen ? frozen[object.id] : object.card ? pack(table, change.controller ?? object.owner, object.card) : undefined;
		if (!registers) continue;
		change.registers = structuredClone(registers);
		used[object.id] = structuredClone(registers);
	}
	return used;
}

const pack = (table: Table, seat: SeatId, card: string) => table.work[seat]?.packages?.find((entry) => entry.card === card)?.registers;

/** What an option says about a permanent it puts onto the battlefield. An entry is never silent. */
export function entering(table: Table, seat: SeatId, card: string): string {
	const registers = pack(table, seat, card);
	if (registers) return registers.length ? `It enters registering: ${registers.map((registration) => registration.basis).join(" / ")}.` : "It enters with no ongoing abilities registered.";
	return table.printed[card]?.text ? "No package is prepared: it enters with nothing registered." : "";
}

/**
 * How a permanent enters: tapped, with counters (614.1c-d). Its own `enters`
 * registrations and those of permanents already on the battlefield apply, each
 * read with the entering permanent as it now is on the battlefield (614.12).
 * Everything else its group touches reads as it was before the group, so
 * permanents entering together never shape each other's entry, whatever order
 * the changes are written in.
 */
export function terms(table: Table, object: Thing, before: Record<ObjectId, Thing> = {}, born: ReadonlySet<ObjectId> = new Set()): { tapped?: true; counters: Record<string, number> } {
	const live = tableWorld(table);
	const objects = live.objects.flatMap((one) => one.id === object.id ? [one] : born.has(one.id) ? [] : [before[one.id] ?? one]);
	for (const [id, was] of Object.entries(before)) if (id !== object.id && !table.things.has(id)) objects.push(was);
	const world = { ...live, objects, get history() { return live.history; } };
	const found: { tapped?: true; counters: Record<string, number> } = { counters: {} };
	for (const holder of objects as Thing[]) {
		if (holder.zone !== "battlefield") continue;
		for (const registration of characteristics(table, holder)?.registrations ?? []) {
			if (registration.kind !== "enters") continue;
			const scope: Scope = { world, controller: holder.controller, source: holder };
			if (registration.affects ? !matches(scope, object, registration.affects) : holder !== object) continue;
			if (registration.if && !holds(scope, registration.if)) continue;
			if (registration.tapped) found.tapped = true;
			for (const [kind, count] of Object.entries(registration.counters ?? {})) found.counters[kind] = (found.counters[kind] ?? 0) + amount(scope, count);
		}
	}
	return found;
}
