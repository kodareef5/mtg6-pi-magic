/** Resolution payments use the same nonmana costs and exact funding as announcements.
 * A payment is one group; an unavailable part offers no partial payment. */
import { extras } from "./announce.ts";
import { manaChoices } from "./mana-cost.ts";
import { fundings, paying } from "./funding.ts";
import { amount, viewWorld, type Scope } from "./selectors.ts";
import { project } from "./view.ts";
import type { Cost } from "./language.ts";
import type { Paid, Table } from "./table.ts";
import type { Change } from "./syntax.ts";
import type { ObjectRef, SeatId } from "./types.ts";
import type { Choice } from "./instructions.ts";
import { exilePool, exileValue } from "./cost-selection.ts";

export function paymentChoices(table: Table, scope: Scope, cost: Cost, who: SeatId, resolving: string): Choice[] {
	if (cost.additional || cost.alternative) throw new Error("Named additional and alternative costs belong to a spell announcement, not a resolving payment.");
	const frame = { seat: who, version: table.cursor.clock, view: project(table, who) };
	const source = frame.view.objects?.find((one) => one.id === scope.source?.id && one.incarnation === scope.source.incarnation);
	const context = { ...scope, world: viewWorld(frame.view), controller: who, source };
	// If the source left, it cannot pay with itself. The resolving stack object has no source resources.
	const origin = source ?? table.things.get(resolving)!;
	const equivalents = manaChoices(cost.mana ?? "");
	if (!equivalents) return [];
	const ways = extras({ source: {}, claim: "Pay", basis: "Accepted resolving cost", timing: "stack", cost, instructions: [] }, context, origin, frame);
	const selection = typeof cost.exile === "object" && "graveyard" in cost.exile ? cost.exile : undefined;
	const picked = (table.resolution?.picked ?? []).filter((one) => "id" in one), pool = selection ? exilePool(context, selection) : [];
	const chosen = pool.filter((one) => picked.some((ref) => ref.id === one.id && ref.incarnation === one.incarnation));
	const total = exileValue(context, chosen);
	const funded = equivalents.flatMap((mana, hybrid) => ways.flatMap((way, part) => fundings(frame, {
		generic: Math.max(0, mana.generic + mana.x * (scope.x ?? 0) - (cost.reduce ? amount(context, cost.reduce) : 0) - (way.reduce ?? 0)), colors: mana.colors, life: way.paid.life,
	}, new Set(way.uses)).map(({ funding, shows }, at): Choice => {
		const changes = costChanges({ ...way.paid, ...(selection ? { exiled: picked } : {}) }, origin, who);
		const simple = Object.keys(cost).every((key) => key === "mana" || key === "life");
		const label = simple ? `Pay${cost.life ? ` ${cost.life} life` : ""}${cost.mana ? ` ${cost.mana}` : ""}. ${cost.mana ? shows : ""}`
			: `Pay ${cost.mana ?? "the cost"}. ${selection ? `Exile ${chosen.map((one) => one.card ?? one.id).join(", ")} (total mana value ${total}). ` : way.shows}${shows}`;
		return { id: `${ways.length === 1 ? `pay-${at}` : `pay-${part}-${at}`}${equivalents.length > 1 ? `-h${hybrid}` : ""}`, label,
			changes: [...changes, ...paying(funding, who, table.cursor.clock, changes.length)] };
	})));
	if (!selection || !funded.length) return funded;
	const choices: Choice[] = pool.filter((one) => !picked.some((ref) => ref.id === one.id)).map((one) => ({ id: `select-${one.id}`,
		label: `Select ${one.card ?? one.id} (mana value ${context.world.read(one)?.manaValue ?? 0}); selected ${total}, required ${selection.totalManaValue}`,
		pick: { id: one.id, incarnation: one.incarnation }, ...(one.card ? { cards: [one.card] } : {}), changes: [] }));
	if (chosen.length === picked.length && total >= selection.totalManaValue) choices.push(...funded);
	return choices;
}

/** One physical payment, shared by announcement and a resolving pay instruction. */
export function costChanges(cost: Omit<Paid, "generic" | "colors">, source: ObjectRef, controller: SeatId): Change[] {
	return [
		...(cost.loyalty ? [{ do: "counters" as const, what: source.id, kind: "loyalty", amount: cost.loyalty }] : []),
		...(cost.tap ? [{ do: "tap" as const, what: source.id }] : []),
		...(cost.tapped ?? []).map((ref) => ({ do: "tap" as const, what: ref.id })),
		...(cost.shown ?? []).filter((ref) => ref.reveal).map((ref) => ({ do: "reveal" as const, what: ref.id })),
		...(cost.sacrificed ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "graveyard" as const, reason: "sacrifice" as const })),
		...(cost.returned ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "hand" as const, reason: "cost-payment" as const })),
		...(cost.exiled ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "exile" as const, reason: "cost-payment" as const })),
		...(cost.discarded ?? []).map((ref) => ({ do: "move" as const, what: ref.id, to: "graveyard" as const, reason: "discard" as const })),
		...(cost.life ? [{ do: "change-life" as const, who: controller, amount: -cost.life, reason: "cost-payment" as const }] : []),
		...(cost.counters ? (cost.counters.on ?? [source]).map((ref) => ({ do: "counters" as const, what: ref.id, kind: cost.counters!.kind, amount: cost.counters!.count * (cost.counters!.put ? 1 : -1) })) : []),
	];
}
