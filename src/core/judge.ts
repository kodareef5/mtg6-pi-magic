/**
 * The judge. Core, and a different role from any seat's strategist.
 *
 * It settles rules questions and records repairs. It never tells a seat to make
 * a stronger move: a legal but poor choice is nobody's dispute, and a missed
 * opportunity is not a case.
 *
 * A player opens a case. The table does not police a move and does not refer
 * one. The single exception is conservation: a declaration that would spend
 * what does not exist or leave a card in two zones is refused outright in
 * declare.ts, because no ruling can unspend it afterwards.
 *
 * The rules are on disk, in rules.ts. A ruling cites the rule it rests on,
 * because a citation is checkable and an assertion is not.
 *
 * design-ref/archive/FIRST-PASS-MODULES.md section 7.
 */

import type { Receipt, Table } from "./table.ts";
import type { SeatId } from "./types.ts";
import type { Universe } from "./cards.ts";
import { start } from "./commit.ts";
import { relive } from "./journal.ts";
import { project } from "./view.ts";

/** One objection: a seat says another seat's recorded action broke a rule or misread a card. */
export type Case = {
	/** The ledger row of the contested action. */
	row: number;
	raisedBy: SeatId;
	claim: string;
	/** The rule the objecting seat cites, if it names one. */
	rule?: string;
};

/**
 * What the judge decided. An illegal action is rolled back to just before it,
 * or left standing with the ruling on record when going back would cost more
 * than the mistake. A legal one stands.
 */
export type Ruling = { legal: boolean; rule: string; remedy: "rollback" | "stand"; because: string };

/**
 * A ruling as the game keeps it. `at` is the version it applies at: for a
 * rollback, the version the game went back to. `kept` is how many journal lines
 * the rolled-back table holds, so the journal knows where its next line goes.
 */
export type Ruled = { case: Case; at: number } & (
	{ ruling: Ruling; kept?: number; failed?: never } | { ruling: null; failed: string; kept?: never }
);

/** A heard case still belongs to this branch unless a later rollback replaced its row. */
export function heard(table: Table, row: number): Ruled | undefined {
	for (const entry of [...table.rulings].reverse()) {
		if (entry.kept !== undefined && entry.case.row <= row) return undefined;
		if (entry.case.row === row) return entry;
	}
	return undefined;
}

/** An immediate public record, not a ruling or a claim about historical characteristics. */
export function recentBlock(table: Table) {
	const row = table.ledger.at(-1), receipt = table.log.at(-1), cursor = table.cursor;
	if (!row || row.situation !== "turn-based" || row.picked !== "block:done" ||
		!receipt || receipt.clock !== row.clock || cursor.steps[0] !== "declare-blockers" || !cursor.stepDone ||
		!(cursor.clock === row.clock || cursor.clock === row.clock! + 1 && cursor.priority === cursor.active && cursor.passes === 0)) return undefined;
	const block = receipt.changes.find((change) => change.do === "block");
	if (!block || block.do !== "block") return undefined;
	const result = heard(table, row.seq);
	return { row: row.seq, clock: receipt.clock, seat: row.seat, blockers: structuredClone(block.blockers), heard: !!result,
		...(result ? { result: result.ruling ? { ruling: structuredClone(result.ruling) } : { failed: result.failed } } : {}) };
}

/** Keep an upheld ruling beside the pending block being revised, across provisional picks and work. */
export function pendingBlockRuling(table: Table) {
	const rolled = table.rulings.findLast((entry) => entry.kept !== undefined);
	if (!rolled?.ruling || table.cursor.steps[0] !== "declare-blockers" || table.cursor.stepDone ||
		table.ledger.slice(rolled.case.row).some((row) => row.situation !== "turn-based" ||
			row.picked === "block:done" || !/^(?:un)?block:/.test(row.picked))) return undefined;
	return { row: rolled.case.row, ruling: structuredClone(rolled.ruling) };
}

/** Reconstruct only on an objection. The public prefix, never today's identities, supplies the evidence. */
export function declarationEvidence(table: Table, row: number, universe: Universe) {
	const recorded = table.ledger[row];
	const declaration = table.log.find((receipt) => receipt.clock === recorded?.clock)?.changes
		.filter((change) => change.do === "block" || change.do === "attack");
	if (!declaration?.length) return undefined;
	const before = project(relive(start(table.format, table.seats.map(({ name, deck }) => ({ name, deck })), table.rng.seed, universe),
		table.ledger.slice(0, row), table.workLog.filter((entry) => entry.at <= row)), "spectator");
	return { window: before.window, declaration: structuredClone(declaration),
		objects: before.objects?.filter((object) => object.zone === "battlefield"), notes: before.notes,
		printed: before.printed, table: before.table };
}

/**
 * The last resort, when the rules cannot settle it and no ruling lands.
 *
 * Two friends who cannot work out how a card behaves make a call, write it
 * down, and keep playing. So this asks one question only: can play continue
 * with this action having no effect? On continue, the object leaves the stack
 * as a resolved one would and the gap is recorded with the card and the clause.
 *
 * A missing or unreadable answer continues, because the default has to be play
 * on. A finished game with three recorded gaps is worth far more than a dead
 * game at turn four.
 */
export function playOn(table: Table, about: Receipt | { option: string }, why: string): void {
	void [table, about, why];
	throw new Error("playOn is unwritten: record the gap and continue.");
}
