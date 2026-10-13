/**
 * Giving up.
 *
 * A seat may concede whenever it is asked anything (104.3a), and a table's
 * clock concedes for a seat whose time ran out. Either way the concession is a
 * ledger row at the decision the seat was asked: `concede`, with `chosen` or
 * `timeout` as its reason. Replay applies the row like any other, so a game
 * that ended by concession replays to the same end. The seat loses, and with
 * one seat left the game is over.
 */

import { commit } from "./commit.ts";
import { nextDecision } from "./decisions.ts";
import { offered } from "./offered.ts";
import type { Table } from "./table.ts";
import type { SeatId } from "./types.ts";

export function concede(table: Table, seat: SeatId, why: "chosen" | "timeout" = "chosen"): void {
	if (table.outcome) throw new Error("The game is already over.");
	const decision = nextDecision(table);
	if (decision?.seat !== seat) throw new Error(`Seat ${seat} concedes when it is asked; the table is asking ${decision ? `seat ${decision.seat}` : "nobody"}.`);
	table.ledger.push({ seq: table.ledger.length, clock: table.cursor.clock + 1, situation: decision.situation, seat,
		offered: offered(decision.options.map((option) => option.id)), picked: "concede", by: why === "timeout" ? "engine" : "model", why });
	commit(table, [{ do: "end-game", who: seat, result: "lose" }], "concede");
	// With more than two seats, 800.4a also takes the seat's objects out of the game and moves priority on. Not built.
	if (!table.outcome) table.gaps.push(`Seat ${seat} conceded with more than one seat left; leaving the game is not built for more than two seats.`);
}
