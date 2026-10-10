/** Plan adherence, read from a journal. At each decision the pilot answered while a plan step was due and
 * takeable, did its pick carry out a due step or branch? Derived on replay, stored nowhere: the same rows and
 * the same code give the same count. A pass while a step waited for the stack is not counted against the pilot. */
import { read, relive, rowsOf } from "../src/core/journal.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { execution, planReason, planState } from "../src/core/planning.ts";
import { dealtTable } from "./matchup-fixture.ts";

export type Adherence = {
	/** Decisions the pilot answered itself. */
	decided: number;
	/** Of those, decisions where a plan step was due with a listed option to take it. */
	due: number;
	/** Picks that carried out a due step or a standing branch. */
	onPlan: number;
	/** A pass or a finished declaration while a step was due and takeable. */
	passedOver: number;
	/** Another action while a step was due and takeable. */
	deviated: number;
};

export function adherence(journal: string): Adherence {
	const { header, lines } = read(journal);
	const count: Adherence = { decided: 0, due: 0, onPlan: 0, passedOver: 0, deviated: 0 };
	relive(dealtTable(header), rowsOf(lines), lines.flatMap((line) => "work" in line ? [line.work] : []), (table, decision, row) => {
		if (row.by !== "model" || row.why !== "chosen" || !table.work[row.seat]) return;
		count.decided += 1;
		const frame = workFrame(table, row.seat);
		// With strategy due, the loop offers no marks; the pilot is not flying a plan here.
		if (planReason(frame) !== undefined) return;
		const state = planState(frame);
		if (!state || !state.due.some((step) => step.candidates.length && !step.waiting)) return;
		count.due += 1;
		if (execution(state, row.picked)) count.onPlan += 1;
		else if (["pass", "attack:done", "block:done"].includes(row.picked) || decision.options.length === 1) count.passedOver += 1;
		else count.deviated += 1;
	});
	return count;
}
