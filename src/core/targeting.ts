/** Target counts and announced divisions (601.2c-d). Assigned amounts stay with
 * their recipients; an illegal target never donates its share during resolution. */
import { amount, matches, players, targetKey, type Chosen, type Scope } from "./selectors.ts";
import type { Amount, Target } from "./language.ts";

export function targetCandidates(slot: Target, scope: Scope): Chosen[] {
	const seats = slot.player === undefined ? [] : slot.player === "any" ? scope.world.players.map(one => one.id) : players(scope, slot.player);
	return [...(slot.object ? scope.world.objects.filter(object => matches(scope, object, slot.object!))
		.map(({ id, incarnation, controller }) => ({ id, incarnation, ...(slot.perController ? { controller } : {}) })) : []), ...seats.map(player => ({ player }))];
}

/** A per-player target names that controller when announced (601.2c). */
export function validTargetControllers(slot: Target, chosen: Chosen[], scope: Scope): boolean {
	if (!slot.perController) return chosen.every(one => one.controller === undefined);
	const counts = new Map<number, number>();
	for (const one of chosen) {
		if (!("id" in one) || one.controller === undefined || !scope.world.objects.some(object =>
			object.id === one.id && object.incarnation === one.incarnation && object.controller === one.controller)) return false;
		const count = (counts.get(one.controller) ?? 0) + 1;
		if (count > slot.perController) return false;
		counts.set(one.controller, count);
	}
	return true;
}

export function targetBounds(slot: Target, scope: Scope, available = targetCandidates(slot, scope).length) {
	let maximum = slot.count === "any" ? available : slot.count ?? 1;
	let minimum = slot.atLeast ?? (slot.upTo || slot.count === "any" ? 0 : maximum);
	if (slot.divide !== undefined) {
		const total = amount(scope, slot.divide);
		maximum = Math.min(maximum, total);
		if (total > 0) minimum = Math.max(1, minimum);
	}
	return { minimum, maximum };
}

export function validDivision(slot: Target, chosen: Chosen[], scope: Scope): boolean {
	if (slot.divide === undefined) return chosen.every(one => one.amount === undefined);
	return chosen.every(one => Number.isInteger(one.amount) && one.amount! > 0) &&
		chosen.reduce((sum, one) => sum + one.amount!, 0) === amount(scope, slot.divide);
}

/** The recorded allocation, read per recipient instead of recomputing the total. */
export function assignedAmount(scope: Scope, value: Amount | { divided: number }, recipient: Chosen): number {
	return typeof value === "object" && "divided" in value
		? scope.targets?.[value.divided]?.find(one => targetKey(one) === targetKey(recipient))?.amount ?? 0
		: amount(scope, value);
}

export const targetChoiceKey = (one: Chosen) => `${targetKey(one)}${one.amount === undefined ? "" : `~${one.amount}`}`;

/** Historical complete menus and trigger placement retain every allocation.
 * Staged casts use bounds and one recipient at a time, never this product. */
export const targetings = (slots: Target[], scope: Scope): Chosen[][][] => slots.reduce<Chosen[][][]>((sets, slot) => sets.flatMap(set => {
	const scoped = { ...scope, targets: set }, pool = targetCandidates(slot, scoped), { minimum, maximum } = targetBounds(slot, scoped, pool.length);
	const found: Chosen[][] = [];
	const divide = (chosen: Chosen[], at: number, left: number): void => {
		if (at === chosen.length) { if (left === 0) found.push(chosen); return; }
		const remaining = chosen.length - at - 1;
		for (let n = remaining ? 1 : left; n <= left - remaining; n++) {
			if (n > 0) divide(chosen.map((one, index) => index === at ? { ...one, amount: n } : one), at + 1, left - n);
		}
	};
	const select = (from: number, chosen: Chosen[]) => {
		if (!validTargetControllers(slot, chosen, scoped)) return;
		if (chosen.length >= minimum) {
			if (slot.divide === undefined) found.push(chosen);
			else divide(chosen, 0, amount(scoped, slot.divide));
		}
		if (chosen.length >= maximum) return;
		for (let at = from; at < pool.length; at++) select(at + 1, [...chosen, pool[at]!]);
	};
	if (maximum >= minimum) select(0, []);
	return found.map(chosen => [...set, chosen]);
}), [[]]);
