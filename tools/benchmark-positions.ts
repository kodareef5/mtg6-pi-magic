/**
 * A saved decision rebuilt the way the game loop offers it, so a benchmark asks
 * the pilot the same question the game did: the seat's view since its last
 * decision, the decision with the plan's marks, and the brief as seating reads it.
 */
import type { Frame, SeatId } from "../src/core/types.ts";
import type { Table } from "../src/core/table.ts";
import type { Plan } from "../src/core/language.ts";
import { replay } from "../src/core/journal.ts";
import { nextDecision } from "../src/core/decisions.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { project, sinceDecision } from "../src/core/view.ts";
import { annotate, planReason, planState } from "../src/core/planning.ts";
import { current, type Brief } from "../src/context/brief.ts";
import { matchTable, matchup } from "./matchup-fixture.ts";

/** The table and brief at a recorded version; `workAt` keeps only that many work entries recorded at it. */
export function position(journal: string, version: number, seat: SeatId, workAt?: number): { table: Table; brief?: Brief } {
	const saved = replay(journal, (header) => matchTable(header.seed), version, { cards: matchup.cards, rules: matchup.rules }, workAt === undefined ? {} : { workAt });
	const made = saved.prepared.find((entry) => entry.seat === seat)?.made;
	return { table: saved.table, ...(made ? { brief: current(made, seat) } : {}) };
}

/** The frame src/core/loop.ts hands the seat: plan state from its work, then the view since its last decision. `plan` replaces the plan for supplied coverage. */
export function decisionFrame(table: Table, seat: SeatId, options: { refused?: readonly string[]; plan?: Plan } = {}): Frame {
	const decision = nextDecision(table);
	if (!decision || decision.seat !== seat) throw new Error(`Seat ${seat} has no decision at this position.`);
	const supplied = <T extends Frame>(frame: T): T => options.plan && frame.view.work ? { ...frame, view: { ...frame.view, work: { ...frame.view.work, plan: options.plan } } } : frame;
	const work = table.work[seat] ? supplied(workFrame(table, seat)) : undefined;
	const state = work && planReason(work) === undefined ? planState(work) : null;
	const view = supplied({ seat, version: table.cursor.clock, view: project(table, seat, sinceDecision(table, seat)) }).view;
	return { seat, version: table.cursor.clock, view, decision: state ? { ...decision, options: annotate(decision.options, state) } : decision,
		...(options.refused?.length ? { refused: [...options.refused] } : {}) };
}
