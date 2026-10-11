/** Casting provenance belongs to the recorded announcement, not a permanent's
 * current characteristics. A resolving permanent can read its spell's payment
 * (400.7c); any later zone change ends that association. */
import type { Mana, Receipt, Table } from "./table.ts";
import type { ObjectRef, SeatId } from "./types.ts";
import type { Zone } from "./syntax.ts";

export type Casting = { from: Zone; by: SeatId; mana: (Mana["color"] | null)[]; x?: number };
const cache = new WeakMap<Table, { clock: number; values: Map<string, Casting | undefined> }>();

/** Public payment facts, derived from receipts. A null color names legacy mana
 * without a creation receipt; its count is known, but its color is not invented. */
export function casting(table: Table, ref: ObjectRef, pending?: Pick<Receipt, "changes" | "before" | "after">): Casting | undefined {
	let saved = cache.get(table);
	if (!saved || saved.clock !== table.cursor.clock) { saved = { clock: table.cursor.clock, values: new Map() }; cache.set(table, saved); }
	const key = `${ref.id}@${ref.incarnation}`;
	if (!pending && saved.values.has(key)) return saved.values.get(key);
	let found: Casting | undefined;
	for (let at = table.log.length; at >= 0; at--) {
		const receipt = at === table.log.length ? pending : table.log[at];
		if (!receipt) continue;
		if (receipt.after[ref.id]?.incarnation !== ref.incarnation) continue;
		const cast = receipt.changes.find((change) => change.do === "activate" && change.what === ref.id && change.ability.timing === "spell");
		if (cast?.do === "activate") {
			const origin = receipt.before[ref.id];
			if (!origin) break;
			const mana = cast.ability.paid.map((id) => {
				const parts = /^mana-(\d+)-(\d+)-(\d+)$/.exec(id);
				const creation = parts && table.log.find((one) => one.clock === Number(parts[1]))?.changes[Number(parts[2])];
				return creation && creation.do === "add-mana" ? creation.colors[Number(parts![3])] ?? null : null;
			});
			found = { from: origin.zone, by: cast.ability.controller, mana: [...mana, ...(cast.ability.funding ?? []).flatMap((tap) => tap.colors)],
				...(cast.ability.x !== undefined ? { x: cast.ability.x } : {}) };
			break;
		}
		const move = receipt.changes.find((change) => change.do === "move" && change.what === ref.id);
		if (move?.do === "move") {
			const before = receipt.before[ref.id];
			if (move.to === "battlefield" && move.reason === "resolve" && before?.zone === "stack") found = casting(table, before);
			break;
		}
	}
	if (!pending) saved.values.set(key, found);
	return found;
}
