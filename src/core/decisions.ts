/**
 * What is pending at the table, and what happens when a seat picks.
 *
 * `nextDecision` is a pure function of the table. Every pending decision can be
 * listed without executing anything, which is what makes a decision testable
 * and a game replayable. An earlier engine found decisions by falling through
 * nested async calls, so a bug in the twentieth branch was unreachable from a
 * test. design-ref/CIRCUITRY.md sections 1 to 4.
 *
 * The ordered checks and application stay together past 150 lines. Pregame,
 * turn obligations and priority actions each own their phase-specific builders.
 */

import { applyDeclared, begin, nextOpening, pickedOpening } from "./pregame.ts";
import { priorityMoves, legal } from "./priority.ts";
import { advanceTurn, completeTurnAction, turnBased } from "./turn.ts";
import type { Move, Pending } from "./moves.ts";
import { commit, playing, seat, type Table } from "./table.ts";
import type { Decision } from "./types.ts";

/**
 * The order is fixed by the rules, not by convenience. State based actions and
 * waiting triggers are handled before anybody receives priority. CR 117.5.
 *
 * Steps 4, 5 and 6 cannot be detected without structured card abilities, so
 * they are absent rather than faked. Their absence is wrong the moment a card
 * has a trigger, which is why the next milestone is cards and not combat.
 *
 * A state condition is not an event. It has no triggering moment, so it belongs
 * in step 3 and is never matched against the log. Treating it as an event makes
 * it either never fire or fire forever. CR 603.2d.
 */
function pending(table: Table): Pending | null {
	if (table.outcome) return null;

	// 2. Pregame: mulligan, then the opening actions a card permits. Situation 7.
	//    Null before the hands are dealt and between rounds: advance deals and
	//    applies, because neither is a decision.
	if (table.opening === null) return null;
	if (!table.opening.done) return nextOpening(table);

	// 3. The loop applies the whole group, then asks again for cascading actions.
	//    Listing the group must not execute it.
	const automatic = stateBased(table);
	if (automatic) return automatic;

	// 4. A replacement applies to a pending event: which applies first.
	// 5. Triggers waiting to go on the stack: what order.
	// 6. A resolution paused on a choice: that choice.
	//    All three need cards. Absent until then.

	// 7. A turn based action is due: untap, draw, declare, discard to hand size.
	const due = turnBased(table);
	if (due) return due;

	// 8. This step grants priority: act or pass.
	//
	// A completed pass chain is not a decision. Once every seat has passed in
	// succession the step is over, so this returns null and advance ends it.
	// Without that check the chain restarts on the first seat forever.
	const holder = table.cursor.priority;
	if (holder !== null && table.cursor.passes < playing(table).length) {
		return {
			situation: "priority",
			seat: holder,
			question: "You have priority.",
			fallback: "pass",
			moves: priorityMoves(table, holder).filter((move) => legal(table, move)),
		};
	}

	// 9. Nothing pending. The caller advances the clock.
	return null;
}

export function nextDecision(table: Table): Decision | null {
	const p = pending(table);
	if (p === null) return null;
	const { moves, ...decision } = p;
	return { ...decision, options: moves.map((move) => move.option) };
}

/**
 * Apply a pick. The moves are recomputed rather than carried over from the
 * earlier call, because the loop is serial and the table has not moved, and
 * because a stashed plan is a stale plan waiting to happen.
 */
export function apply(
	table: Table,
	optionId: string,
	by: "engine" | "model" | "judge",
	why: "forced" | "delegated" | "chosen" | "declared" | "fallback",
): void {
	const p = pending(table);
	if (p === null) throw new Error("apply was called with nothing pending");
	const move = p.moves.find((candidate) => candidate.option.id === optionId);
	if (!move) {
		throw new Error(
			`No option ${optionId}. Offered: ${p.moves.map((m) => m.option.id).join(", ")}`,
		);
	}
	take(table, p, move, by, why);
}

/** Commit one move and write its ledger row. The only path from a pick to the table. */
function take(
	table: Table,
	p: Pending,
	move: Move,
	by: "engine" | "model" | "judge",
	why: "forced" | "delegated" | "chosen" | "declared" | "fallback",
): void {
	if (move.changes.length) commit(table, move.changes, move.reason);
	after(table, p, move);
	table.ledger.push({
		seq: table.ledger.length,
		situation: p.situation,
		seat: p.seat,
		offered: p.moves.map((candidate) => candidate.option.id),
		picked: move.option.id,
		by,
		why,
	});
}

/**
 * The bookkeeping a pick implies that is not a change to the table: whose
 * priority it is next, what a seat declared, how many cards it still owes.
 *
 * Kept apart from `commit` because none of it is a motion. A card never watches
 * for it and a receipt would say nothing useful about it.
 */
function after(table: Table, p: Pending, move: Move): void {
	const cursor = table.cursor;
	const id = move.option.id;

	if (p.situation === "priority") {
		if (id === "pass") {
			cursor.passes += 1;
			const order = playing(table);
			const at = order.findIndex((s) => s.id === p.seat);
			cursor.priority = order[(at + 1) % order.length]?.id ?? null;
		} else {
			// A seat that acts receives priority again, 117.3c, and the pass
			// chain starts over because the table moved.
			cursor.passes = 0;
			cursor.priority = p.seat;
			if (id.startsWith("land:")) seat(table, p.seat).landsPlayed += 1;
		}
		return;
	}

	if (p.situation === "turn-based") {
		completeTurnAction(table);
		return;
	}

	if (p.situation === "pregame") pickedOpening(table, p.seat, id);
}

/**
 * Situation 6. Almost all of these need no decision: lethal damage kills, zero
 * life loses, and nobody is asked. The legend rule is the one that asks, and it
 * needs cards.
 */
function stateBased(table: Table): Pending | null {
	const losing = playing(table).filter((s) =>
		s.life <= 0 || (s.marks["drew-from-empty"] ?? 0) > 0 || (s.marks.poison ?? 0) >= 10,
	);
	if (!losing.length) return null;
	return {
		situation: "state-based",
		seat: losing[0]!.id,
		question: "Apply state-based losses together.",
		moves: [{
			option: { id: `lose:${losing.map((s) => s.id).join(",")}`, label: `Apply losses for ${losing.map((s) => s.name).join(", ")}` },
			changes: losing.map((s) => ({ do: "end-game", who: s.id, result: "lose" })),
			reason: "state-based-action",
		}],
	};
}


/** Advance only when the current window has no pending decision. */
export function advance(table: Table): void {
	if (table.outcome) return;
	if (pending(table)) throw new Error("Answer the pending decision before advancing");
	if (table.opening === null) begin(table);
	else if (!table.opening.done) applyDeclared(table);
	else advanceTurn(table);
}
