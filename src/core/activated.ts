/** Complete abilities carried by permanents, read through their current layers. */
import type { Frame, ObjectRef } from "./types.ts";
import type { Procedure } from "./language.ts";
import type { World } from "./selectors.ts";

/** Any player's earlier loyalty activation uses this incarnation's allowance (606.3). */
export const loyaltyUsed = (world: World, source: ObjectRef) => world.history.some((one) => one.kind === "activated" && one.loyalty &&
	one.source.id === source.id && one.source.incarnation === source.incarnation);

/** Printed and granted abilities have the same source-bound procedure path as token abilities. */
export function activatedUses(frame: Frame): { key: string; procedure: Procedure }[] {
	return (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.controller === frame.seat).flatMap((source) =>
		(source.traits?.registrations ?? []).flatMap((ability, at) => ability.kind === "activated" ? [{ key: `ability:${source.id}@${source.incarnation}:${at}`,
			procedure: { claim: ability.basis, basis: ability.basis, timing: "stack" as const,
				source: { zones: ["battlefield"], controller: "self", registered: ability.basis, refs: [{ id: source.id, incarnation: source.incarnation }] },
				cost: ability.cost, ...(ability.speed ? { speed: ability.speed } : {}), ...(ability.if ? { if: ability.if } : {}),
				...(ability.limit ? { limit: ability.limit } : {}), ...ability.effect } }] : []));
}
