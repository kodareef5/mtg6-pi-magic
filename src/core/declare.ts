/**
 * A seat moving cards itself.
 *
 * This is the path that makes a player as capable as the table's own move list.
 * A seat names the changes it wants and says what it is doing, and the table
 * records both. Nothing here asks whether a rule permits it.
 *
 * What the table enforces is conservation, not rules. It can check that a
 * stated cost was paid from resources that existed. It cannot know what the
 * cost was.
 */

import type { Change } from "./syntax.ts";
import type { Receipt, Table } from "./table.ts";
import type { SeatId } from "./types.ts";

export type Refused =
	/** A named object does not exist, or is not where this seat thinks it is. */
	| { why: "no-such-object"; detail: string }
	/** The mana or the resource being spent is not in that seat's pool. */
	| { why: "nothing-to-spend"; detail: string }
	/** The declaration would end an object in two zones, or none. */
	| { why: "not-conserved"; detail: string }
	/** Carrying it out would tell this seat something it has not earned. */
	| { why: "would-reveal"; detail: string };

/**
 * Announce, check conservation, commit.
 *
 * 1. Announce first. The claim and the changes are recorded before anything
 *    moves, because an objection comes before motion. Once the cards have
 *    moved the position is hard to rebuild.
 * 2. Check only what the table owns: every named object exists and is where
 *    this seat believes it is, anything being spent is actually in that seat's
 *    pool, and no object ends in two zones or in none.
 * 3. Refuse a declaration that would reveal something to this seat that it has
 *    not earned. Visibility is the one boundary a seat cannot reach past, and
 *    it is enforced because a leak cannot be undone by a later ruling.
 * 4. Do not check the rules. A cost this seat got wrong, a timing window it had
 *    no business acting in, a trigger it invented: all of that commits, and any
 *    other seat may open a case about it.
 * 5. Commit through the one door, with the seat, the claim, and the changes on
 *    the receipt.
 */
export function declare(
	table: Table,
	seat: SeatId,
	changes: Change[],
	says: string,
): Receipt | Refused {
	void [table, seat, changes, says];
	throw new Error("declare is unwritten. Five steps above, and step 4 is the point.");
}
