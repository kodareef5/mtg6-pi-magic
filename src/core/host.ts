/**
 * The host's two directions over a game it runs: go back to a version, and end
 * the game.
 *
 * The host is not a seat and makes no move. A rollback rebuilds the table in
 * place, exactly as an upheld objection does, and every seat with a plan is
 * asked for a new one. An end gives every seat still playing a draw: the game
 * is over with no winner. Both are kept as rulings by the host, so they are
 * journal lines that replay honors, and a clone before either is the game
 * without it.
 */

import { commit } from "./commit.ts";
import { rollback } from "./journal.ts";
import { playing, type Table } from "./table.ts";
import { editWork } from "./work-tools.ts";

export function rollbackByHost(table: Table, to: number, note: string, restart: () => Table): void {
	if (!Number.isInteger(to) || to < 0 || to >= table.ledger.length)
		throw new Error(`Roll back to a version from 0 to ${table.ledger.length - 1}. The game is at version ${table.ledger.length}.`);
	rollback(table, { by: "host", note, to }, restart);
	const said = `The host rolled the game back to version ${to}: ${note} Plan from here.`;
	for (const seat of table.seats) if (table.work[seat.id]) editWork(table, seat.id, [{ do: "plan.request", reason: said }], `host-${table.rulings.length}-${seat.id}`);
}

export function endByHost(table: Table, note: string): void {
	if (table.outcome) throw new Error("The game is already over.");
	table.rulings.push({ by: "host", at: table.ledger.length, note, ended: true });
	ended(table);
}

/**
 * The changes an end by the host makes, and replay's way back to them. An end
 * counts only when no rollback came after it.
 */
export function ended(table: Table): void {
	const last = table.rulings.findLast((one) => one.kept !== undefined || "by" in one && one.ended);
	if (!last || !("by" in last) || !last.ended || table.outcome) return;
	commit(table, playing(table).map((seat) => ({ do: "end-game" as const, who: seat.id, result: "draw" as const })), "host");
}
