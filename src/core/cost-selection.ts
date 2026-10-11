/** A graveyard payment is selected without moving cards or spending the other resources. */
import type { Activation, LedgerRow, Table } from "./table.ts";
import type { ObjectRef } from "./types.ts";
import { matches, tableWorld, type Scope, type Seen } from "./selectors.ts";
import type { Pending } from "./moves.ts";

export type Payment = { activation: Activation; picked: ObjectRef[]; execution?: LedgerRow["execution"] };
type Selection = NonNullable<Activation["exileSelection"]>;
const ref = (one: Seen): ObjectRef => ({ id: one.id, incarnation: one.incarnation });
const same = (one: ObjectRef, other: ObjectRef) => one.id === other.id && one.incarnation === other.incarnation;

/** The cost's own-graveyard boundary cannot be widened by its filter. */
export function exilePool(scope: Scope, selection: Selection): Seen[] {
	return scope.world.objects.filter((one) => one.zone === "graveyard" && one.owner === scope.controller &&
		!(scope.source?.zone === "stack" && one.id === scope.source.id) &&
		matches(scope, one, selection.graveyard, scope.world.read(one), ["graveyard"])).sort((a, b) => a.id.localeCompare(b.id));
}
export const exileValue = (scope: Scope, objects: Seen[]) => objects.reduce((sum, one) => sum + (scope.world.read(one)?.manaValue ?? 0), 0);
export const enoughExile = (scope: Scope, selection: Selection) => exileValue(scope, exilePool(scope, selection)) >= selection.totalManaValue;

/** A completed announcement rechecks every selected incarnation and the total. */
export function checkExile(scope: Scope, selection: Selection, picked: ObjectRef[]): void {
	const pool = exilePool(scope, selection), chosen = picked.flatMap((one) => pool.find((candidate) => same(one, candidate)) ?? []);
	if (chosen.length !== picked.length || new Set(picked.map((one) => one.id)).size !== picked.length || exileValue(scope, chosen) < selection.totalManaValue)
		throw new Error("The selected graveyard cards do not pay the required mana value.");
}

export function selectingPayment(table: Table): Pending | null {
	const payment = table.payment;
	if (!payment) return null;
	const { activation, picked } = payment, selection = activation.exileSelection!;
	const source = table.things.get(activation.source.id)!;
	const scope: Scope = { world: tableWorld(table), controller: activation.controller, source: activation.timing === "spell" ? { ...source, zone: "stack" } : source, targets: activation.targets, x: activation.x };
	const pool = exilePool(scope, selection), chosen = pool.filter((one) => picked.some((old) => same(old, one)));
	const total = exileValue(scope, chosen), named = (one: Seen) => `${one.card ?? one.id} (mana value ${scope.world.read(one)?.manaValue ?? 0})`;
	const cards = table.things.get(activation.source.id)?.card;
	const moves: Pending["moves"] = pool.map((one) => {
		const remove = picked.some((old) => same(old, one));
		return { option: { id: `payment:${remove ? "remove" : "pick"}:${one.id}`, label: `${remove ? "Remove" : "Select"} ${named(one)}`, objects: [ref(one)], ...(one.card ? { cards: [one.card] } : {}) },
			changes: [{ do: "payment", payment: { ...payment, picked: remove ? picked.filter((old) => !same(old, one)) : [...picked, ref(one)] } }], reason: "cost-payment" };
	});
	if (chosen.length === picked.length && total >= selection.totalManaValue) {
		const complete = { ...activation, cost: { ...activation.cost, exiled: structuredClone(picked) } };
		moves.push({ option: { id: "payment:done", label: `Pay by exiling ${chosen.map(named).join(", ")} and complete: ${activation.claim}`, use: complete,
			objects: [activation.source, ...picked], ...(cards ? { cards: [cards] } : {}) }, activation: complete, changes: [], reason: "cost-payment" });
	}
	moves.push({ option: { id: "payment:cancel", label: "Cancel this announcement; spend nothing" }, changes: [{ do: "payment" }, ...(table.announcement ? [{ do: "announcement" as const }] : [])], reason: "cost-payment" });
	return { situation: "priority", seat: activation.controller,
		...(table.announcement ? { preparing: { stage: "graveyard" as const, selected: chosen.map(named), ready: total >= selection.totalManaValue } } : {}),
		question: `Prepare payment for ${activation.claim}. Exile own graveyard cards with total mana value at least ${selection.totalManaValue}. Selected ${total}: ${chosen.map(named).join(", ") || "none"}. Nothing is spent until payment is confirmed.`, moves };
}
