/** Draw batches wait for replacement choices, then proceed player by player
 * in active-player order (121.2c). The original continuation runs last. */
import { drawProgress, orderedDraw } from "./draw.ts";
import { tableWorld } from "./selectors.ts";
import { seat, type Table } from "./table.ts";
import type { Change, Reason } from "./syntax.ts";
import type { Pending } from "./moves.ts";

export type DrawOrder = { changes: Change[]; reason: Reason };

export function beforeDraw(table: Table, changes: Change[], reason: Reason): Change[] {
	const draws = changes.filter(one => one.do === "draw");
	return draws.length > 1 || draws.some(one => orderedDraw(tableWorld(table), one).choices.length > 1)
		? [{ do: "draw-order", pending: { changes, reason } }] : changes;
}

export function orderingDraw(table: Table): Pending {
	const pending = table.drawOrder!, index = pending.changes.findIndex(one => one.do === "draw"), draw = pending.changes[index];
	if (!draw || draw.do !== "draw") throw new Error("A pending draw sequence has no draw batch.");
	const result = orderedDraw(tableWorld(table), draw);
	const options = result.choices.length ? result.choices.map(effect => ({ id: effect.id, label: `Apply ${effect.label}` }))
		: [{ id: "draw", label: `${seat(table, draw.who).name} draws ${result.count} card${result.count === 1 ? "" : "s"}` }];
	return { situation: "replacement-order", seat: draw.who, question: result.choices.length
		? `Choose the next replacement for ${seat(table, draw.who).name}'s draw. No cards in this batch move yet.`
		: `Complete ${seat(table, draw.who).name}'s draw before the next player's batch.`,
		moves: options.map(option => {
			const changes = structuredClone(pending.changes), batch = changes[index]!;
			if (batch.do !== "draw") throw new Error("The pending draw event changed.");
			if (result.choices.length) batch.replacements = [...result.applied, option.id];
			if (orderedDraw(tableWorld(table), batch).choices.length) return { option: { ...option, id: `draw:${index}:${option.id}` },
				changes: [{ do: "draw-order" as const, pending: { ...pending, changes } }], reason: pending.reason };
			const next = drawProgress(table, changes), more = next.after.some(one => one.do === "draw");
			return { option: { ...option, id: `draw:${index}:${option.id}` }, changes: [...next.before, ...more
				? [{ do: "draw-order" as const, pending: { ...pending, changes: next.after } }]
				: [...next.after, { do: "draw-order" as const }]], reason: pending.reason };
		}) };
}
