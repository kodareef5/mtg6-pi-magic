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
export type Ruled = { case: Case; ruling: Ruling; at: number; kept?: number };

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
