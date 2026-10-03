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
 * design-ref/FIRST-PASS-MODULES.md section 7.
 */

import type { Receipt, Table } from "./table.ts";
import type { SeatId } from "./types.ts";

export type Case = {
	id: string;
	/** The attempted move or the committed receipt under question. */
	about: { option: string } | { receipt: number };
	raisedBy: SeatId | "engine";
	/** What the objection says, from a fixed set rather than free prose. */
	claim: string;
};

export type Ruling =
	| { kind: "allowed"; case: string; because: string[] }
	| { kind: "disallowed"; case: string; because: string[] }
	/** Change an uncommitted move before it commits. */
	| { kind: "amend"; case: string; option: string; because: string[] }
	/** A new explicit operation with its own receipt. Never a secret rewrite. */
	| { kind: "repair"; case: string; because: string[] }
	| { kind: "needs-evidence"; case: string; asking: string[] };

/**
 * Rule on one case.
 *
 * The evidence is pinned: the card text, the receipt, the current frame, the
 * accepted terms, the uncovered spans, and every objection. Source coverage is
 * not limited to the terms that supported the contested move, because the
 * missing term is usually the problem.
 *
 * A ruling authorises that case only. It cannot replace the table with
 * arbitrary data and it cannot rewrite the old log. Information already
 * disclosed stays disclosed: a repair does not make a seat forget a card.
 */
export function rule(table: Table, open: Case): Ruling {
	void [table, open];
	throw new Error("rule is unwritten.");
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
