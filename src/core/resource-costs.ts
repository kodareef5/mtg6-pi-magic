/** Optional sacrifices and tap payments share staged resource selection. Feasibility is a witness,
 * never a selected payment or a list of every subset of the battlefield. */
import type { Cost } from "./language.ts";
import { matches, type Scope } from "./selectors.ts";
import { paymentUnits } from "./funding.ts";
import { canPay } from "./payment-search.ts";
import type { OfferBase, OfferCost } from "./announce.ts";
import type { Frame } from "./types.ts";

export const variableSacrifice = (cost?: Cost) => typeof cost?.sacrifice === "object" && "any" in cost.sacrifice ? cost.sacrifice : undefined;
export const variableTap = (cost?: Cost) => typeof cost?.tap === "object" && cost.tap.pay === "generic" ? cost.tap : undefined;
export const variableResource = (cost?: Cost) => {
	const sacrifice = variableSacrifice(cost), tap = variableTap(cost);
	return sacrifice ? { kind: "sacrifice" as const, choose: sacrifice.choose, each: sacrifice.reduce, limit: Infinity }
		: tap ? { kind: "tap" as const, choose: tap.choose, each: 1, limit: tap.count! } : undefined;
};
export const resourcePool = (scope: Scope, cost?: Cost) => {
	const choice = variableResource(cost);
	return choice ? scope.world.objects.filter(one => one.zone === "battlefield" && one.controller === scope.controller && (choice.kind !== "tap" || !one.tapped) && matches(scope, one, choice.choose)) : [];
};

/** A selected permanent can make mana before it is sacrificed, but cannot be
 * sacrificed to both costs. Other additional resources remain reserved. */
export function paymentReservations(way: OfferCost) {
	const leaving = new Set(way.cost.sacrificeReduction === undefined ? [] : way.cost.sacrificed?.map(one => one.id));
	return { leaving, except: new Set(way.extra.uses.filter(id => !leaving.has(id))) };
}

export function resourcePayable(base: OfferBase, frame: Frame, way: OfferCost): boolean {
	const choice = variableResource(base.procedure.cost), { leaving, except } = paymentReservations(way);
	const candidates = new Set(resourcePool(base.scope, base.procedure.cost).filter(one => !way.extra.uses.includes(one.id)).map(one => one.id));
	const units = paymentUnits(frame, except, base.spending, base.castFrom, way.price.generic + way.price.colors.length, leaving);
	const groups = new Map<string, { id: string; yields: { colors: typeof way.price.colors; life?: number; tapped?: { id: string }[]; reduce?: number }[] }[]>();
	for (const unit of units) {
		const yields = unit.yields.map(one => choice?.kind === "sacrifice" && one.sacrifice && candidates.has(unit.id)
			? { ...one, tapped: [...one.tapped ?? [], { id: `sacrifice:${unit.id}` }] } : one);
		groups.set(unit.id, [...groups.get(unit.id) ?? [], { id: unit.id, yields }]);
	}
	// Interleave exclusive sacrifice and mana choices. Search memoization can
	// then forget a resource once no later choice mentions it.
	for (const id of candidates) groups.set(id, [...groups.get(id) ?? [], { id: choice?.kind === "tap" ? id : `sacrifice:${id}`, yields: [{ colors: [], reduce: choice!.each }] }]);
	return canPay([...groups.values()].flat(), { ...way.price, life: way.extra.paid.life }, frame.view.players?.find(one => one.id === frame.seat)?.life ?? 0, undefined, choice?.kind === "tap" ? Math.max(0, choice.limit - (way.cost.tapped?.length ?? 0)) : undefined);
}
