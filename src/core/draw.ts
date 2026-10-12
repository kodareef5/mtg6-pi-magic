/** Batch draw increases apply before individual draws (121.2a). Individual draw
 * replacements, multipliers and draw prohibitions need separate terms. */
import { holds, players, tableWorld, type World } from "./selectors.ts";
import { cardsIn, type Table } from "./table.ts";
import type { Change } from "./syntax.ts";

export type Draw = Extract<Change, { do: "draw" }>;
type Effect = { id: string; label: string; additional: number };

/** The hand condition is read before any card in this batch moves. */
export function orderedDraw(world: World, draw: Draw) {
	if (!Number.isInteger(draw.count) || draw.count < 0) throw new Error("A draw count must be a nonnegative integer.");
	const remaining: Effect[] = [];
	if (draw.count) for (const source of world.objects.filter(one => one.zone === "battlefield")) {
		const scope = { world, controller: source.controller, source }, traits = world.read(source);
		for (const [index, rule] of (traits?.registrations ?? []).entries()) {
			if (rule.kind !== "draw-rule" || !players(scope, rule.who).includes(draw.who) || rule.if && !holds(scope, rule.if)) continue;
			remaining.push({ id: `${source.id}@${source.incarnation}:${index}`, label: `${traits?.name ?? "Permanent"}: ${rule.basis}`, additional: rule.additional });
		}
	}
	let count = draw.count;
	const applied: string[] = [];
	const apply = (id: string) => {
		const at = remaining.findIndex(one => one.id === id);
		if (at < 0) throw new Error("The recorded draw replacement no longer applies.");
		const [rule] = remaining.splice(at, 1); count += rule!.additional; applied.push(id);
	};
	for (const id of draw.replacements ?? []) apply(id);
	if (remaining.length === 1) apply(remaining[0]!.id);
	return { count, applied, choices: remaining };
}

/** Replace the first batch with its physical draws, retaining the later work.
 * Binding follows the original draw only; a replaced draw cannot supply the
 * cards for an additional instruction on that card (121.6c, 614.11b). */
export function drawProgress(table: Table, changes: Change[]) {
	const index = changes.findIndex(one => one.do === "draw"), draw = changes[index];
	if (!draw || draw.do !== "draw") throw new Error("There is no pending draw batch.");
	const result = orderedDraw(tableWorld(table), draw);
	if (result.choices.length) throw new Error("Drawing needs its affected player's replacement-order choice before committing.");
	const top = cardsIn(table, "library", draw.who).slice(0, result.count);
	const before = changes.slice(0, index), after = structuredClone(changes.slice(index + 1));
	if (draw.as) {
		const next = after.find(one => one.do === "resolution" && one.action === "next");
		if (!next || next.do !== "resolution" || next.action !== "next") throw new Error("A bound draw needs its resolving continuation.");
		const prior = next.bind?.[draw.as]?.objects ?? [];
		next.bind = { ...next.bind, [draw.as]: { objects: [...prior, ...result.applied.length ? [] : top.map(one => ({ id: one.id, incarnation: one.incarnation + 1 }))], players: [] } };
	}
	const drawn: Change[] = [...top.map(one => ({ do: "move" as const, what: one.id, to: "hand" as const, reason: "draw" as const })),
		...(top.length < result.count ? [{ do: "mark-player" as const, who: draw.who, key: "drew-from-empty", add: 1 }] : [])];
	return { before: [...before, ...drawn], after };
}

/** Legacy receipts remain physical moves. Several players draw in separate
 * batches so later replacement conditions see the earlier player's new hand. */
export function expandDraw(table: Table, changes: Change[]): Change[] {
	const batches = changes.filter(one => one.do === "draw").length;
	if (!batches) return changes;
	if (batches > 1) throw new Error("Multiple players' draw batches need their recorded sequence.");
	const result = drawProgress(table, changes);
	return [...result.before, ...result.after];
}
