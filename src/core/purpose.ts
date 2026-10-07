/** A seat's intent at announcement time, recovered from its own accepted work. */
import type { Table } from "./table.ts";
import type { SeatId, SeatView } from "./types.ts";
import { matches } from "./query.ts";
import { STEPS } from "./steps.ts";

export function purposes(table: Table, viewer: SeatId): NonNullable<SeatView["purposes"]> {
	return [...table.things.values()].filter((one) => one.zone === "stack" && one.ability?.controller === viewer).flatMap((object) => {
		const receipt = table.log.findLast((one) => one.changes.some((change) => change.do === "activate" ?
			(change.ability.timing === "spell" ? change.what === object.id && one.after[object.id]?.incarnation === object.incarnation : change.id === object.id)
			: change.do === "trigger" && change.action === "put" && change.id === object.id));
		const row = receipt && table.ledger[receipt.at - 1];
		if (!row || row.seat !== viewer) return [];
		const work = table.workLog.findLast((entry) => entry.seat === viewer && entry.clock < (row.clock ?? 0) &&
			(row.execution ? entry.workspace.planned === row.execution.plan : true))?.workspace;
		const plan = work?.plan;
		if (!plan || plan.throughTurn !== undefined && table.cursor.turn > plan.throughTurn) return [];
		const step = row.execution?.step !== undefined ? plan.steps[row.execution.step] : row.execution?.branch !== undefined ? plan.may?.[row.execution.branch] : undefined;
		// The stack must finish before this rules step advances. Read that window
		// against the historical plan, never against an intervening amendment.
		const { turn, active, steps } = table.cursor;
		const window = { kind: "turn" as const, turn, active, step: steps[0]!, phase: STEPS[steps[0]!].phase };
		const policies = (plan.phases ?? []).filter((one) => matches(one.when, { seat: viewer, view: { window } }));
		return [{ object: { id: object.id, incarnation: object.incarnation }, row: row.seq, objective: plan.objective,
			...(step ? { use: step.purpose ?? step.label } : {}), guidance: policies.map((one) => one.guidance).join("\n") }];
	});
}
