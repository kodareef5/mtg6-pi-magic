/**
 * Giving up.
 *
 * A seat may concede whenever it is asked anything. It takes effect at once:
 * that seat loses, and whether the game is over depends on how many seats are
 * left, which is why this is one function rather than a line in the loop.
 */

import { commit } from "./commit.ts";
import { seat as seatOf, type Table } from "./table.ts";
import type { SeatId } from "./types.ts";

export function concede(table: Table, seat: SeatId): void {
	/*
	 * 1. Commit end-game for that seat with result lose, so the concession is a
	 *    recorded event like anything else and replay sees it.
	 * 2. Everything that seat owned leaves the game. It is not a player any
	 *    more, and a card that was going to trigger on its turn does not.
	 * 3. One seat left: the game is over and the outcome is recorded. More than
	 *    one: play continues with the remaining seats, which is why eight seat
	 *    formats need this and two seat games barely notice it.
	 * 4. If the conceding seat held priority or was mid resolution, the clock
	 *    moves on to the next seat that can hold it.
	 */
	void [table, seat, commit, seatOf];
	throw new Error("concede is unwritten. Four steps above.");
}
