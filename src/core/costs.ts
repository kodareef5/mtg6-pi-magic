/** Resolution payments use the same nonmana costs and exact funding as announcements.
 * A payment is one group; an unavailable part offers no partial payment. */
import { extras, symbols } from "./announce.ts";
import { fundings, paying } from "./funding.ts";
import { amount, viewWorld, type Scope } from "./selectors.ts";
import { project } from "./view.ts";
import type { Cost } from "./language.ts";
import type { Paid, Table } from "./table.ts";
import type { Change } from "./syntax.ts";
import type { ObjectRef, SeatId } from "./types.ts";
import type { Choice } from "./instructions.ts";

export function paymentChoices(table: Table, scope: Scope, cost: Cost, who: SeatId, resolving: string): Choice[] {
	const frame = { seat: who, version: table.cursor.clock, view: project(table, who) };
	const source = frame.view.objects?.find((one) => one.id === scope.source?.id && one.incarnation === scope.source.incarnation);
	const context = { ...scope, world: viewWorld(frame.view), controller: who, source };
	// If the source left, it cannot pay with itself. The resolving stack object has no source resources.
	const origin = source ?? table.things.get(resolving)!;
	const mana = cost.mana ? symbols(cost.mana) : { generic: 0, colors: [], x: 0 };
	if (!mana) return [];
	const price = { generic: Math.max(0, mana.generic + mana.x * (scope.x ?? 0) - (cost.reduce ? amount(context, cost.reduce) : 0)), colors: mana.colors };
	const ways = extras({ source: {}, claim: "Pay", basis: "Accepted resolving cost", timing: "stack", cost, instructions: [] }, context, origin, frame);
	return ways.flatMap((way, part) => fundings(frame, { ...price, life: way.paid.life }, new Set(way.uses)).map(({ funding, shows }, at) => {
		const changes = costChanges(way.paid, origin, who);
		const simple = Object.keys(cost).every((key) => key === "mana" || key === "life");
		const label = simple ? `Pay${cost.life ? ` ${cost.life} life` : ""}${cost.mana ? ` ${cost.mana}` : ""}. ${cost.mana ? shows : ""}`
			: `Pay ${cost.mana ?? "the cost"}. ${way.shows}${shows}`;
		return { id: ways.length === 1 ? `pay-${at}` : `pay-${part}-${at}`, label,
			changes: [...changes, ...paying(funding, who, table.cursor.clock, changes.length)] };
	}));
}

/** One physical payment, shared by announcement and a resolving pay instruction. */
export function costChanges(cost: Omit<Paid, "generic" | "colors">, source: ObjectRef, controller: SeatId): Change[] {
	return [
		...(cost.tap ? [{ do: "tap" as const, what: source.id }] : []),
		...(cost.tapped ?? []).map((ref) => ({ do: "tap" as const, what: ref.id })),
		...(cost.shown ?? []).filter((ref) => ref.reveal).map((ref) => ({ do: "reveal" as const, what: ref.id })),
		...(cost.sacrificed ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "graveyard" as const, reason: "sacrifice" as const })),
		...(cost.exiled ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "exile" as const, reason: "cost-payment" as const })),
		...(cost.discarded ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "graveyard" as const, reason: "discard" as const })),
		...(cost.life ? [{ do: "change-life" as const, who: controller, amount: -cost.life, reason: "cost-payment" as const }] : []),
		...(cost.counters ? (cost.counters.on ?? [source]).map((ref) => ({ do: "counters" as const, what: ref.id, kind: cost.counters!.kind, amount: cost.counters!.count * (cost.counters!.put ? 1 : -1) })) : []),
	];
}
