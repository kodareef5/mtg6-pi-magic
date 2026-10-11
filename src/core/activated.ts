/** Complete abilities carried by permanents, read through their current layers. */
import type { Frame, ObjectRef } from "./types.ts";
import type { Procedure } from "./language.ts";
import type { Note } from "./table.ts";
import { matches, type Seen, type World } from "./selectors.ts";

/** Any player's earlier loyalty activation uses this incarnation's allowance (606.3). */
export const loyaltyUsed = (world: World, source: ObjectRef) => world.history.some((one) => one.kind === "activated" && one.loyalty &&
	one.source.id === source.id && one.source.incarnation === source.incarnation);

/** Timing grants change a rule, not an object's characteristics (611.2c); read eligible sources now. */
export const instantLoyalty = (world: World, seat: number, source: Seen) => world.notes.some((note) => note.kind === "activation-timing" &&
	note.ability === "loyalty" && note.who === seat && matches({ world, controller: note.who, source: note.source ? world.lastKnown(note.source)?.object : undefined }, source, note.of));

export const activationTimingNotes = (notes: readonly Note[], name: (seat: number) => string): string[] => notes.flatMap((note) => note.kind === "activation-timing"
	? [`${name(note.who)} may activate loyalty abilities of ${JSON.stringify(note.of)} at instant speed (${note.until}); priority and the per-permanent turn allowance still apply.`] : []);

/** Printed and granted abilities have the same source-bound procedure path as token abilities. */
export function activatedUses(frame: Frame): { key: string; procedure: Procedure }[] {
	return (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.controller === frame.seat).flatMap((source) =>
		(source.traits?.registrations ?? []).flatMap((ability, at) => ability.kind === "activated" ? [{ key: `ability:${source.id}@${source.incarnation}:${at}`,
			procedure: { claim: ability.basis, basis: ability.basis, timing: "stack" as const,
				source: { zones: ["battlefield"], controller: "self", registered: ability.basis, refs: [{ id: source.id, incarnation: source.incarnation }] },
				cost: ability.cost, ...(ability.speed ? { speed: ability.speed } : {}), ...(ability.if ? { if: ability.if } : {}),
				...(ability.limit ? { limit: ability.limit } : {}), ...ability.effect } }] : []));
}
