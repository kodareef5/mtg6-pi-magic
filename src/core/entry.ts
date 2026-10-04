/** A permanent registers its seat's package for its name as it enters, by whatever route. */
import { thing, type Table, type ObjectId } from "./table.ts";
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
	if (registers) return `It enters registering: ${registers.map((registration) => registration.basis).join(" / ")}.`;
	return table.printed[card]?.text ? "No package is prepared: it enters with nothing registered." : "";
}
