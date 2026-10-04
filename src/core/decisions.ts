/**
 * What is pending at the table, and what happens when a seat picks.
 *
 * `nextDecision` is a pure function of the table. Every pending decision can be
 * listed without executing anything, which is what makes a decision testable
 * and a game replayable. An earlier engine found decisions by falling through
 * nested async calls, so a bug in the twentieth branch was unreachable from a
 * test. design-ref/archive/CIRCUITRY.md sections 1 to 4.
 *
 * The ordered checks and application stay together past 150 lines. Pregame,
 * turn obligations and priority actions each own their phase-specific builders.
 */

import { applyDeclared, begin, nextOpening, mulligansSettled } from "./pregame.ts";
import { priorityMoves, defaultCasts, legal } from "./priority.ts";
import { advanceTurn, turnBased } from "./turn.ts";
import type { Change } from "./syntax.ts";
import type { Move, Pending } from "./moves.ts";
import { commit } from "./commit.ts";
import { cardsIn, playing, type Table, type LedgerRow } from "./table.ts";
import type { Decision } from "./types.ts";
import { resolving } from "./resolution.ts";
import { attach } from "./entry.ts";
import type { Registration } from "./language.ts";
import { activate } from "./procedures.ts";
import { targetAvailable } from "./targets.ts";
import { project } from "./view.ts";
import { basePT, facts } from "./printed.ts";

/**
 * The order is fixed by the rules, not by convenience. State based actions and
 * waiting triggers are handled before anybody receives priority. CR 117.5.
 *
 * Replacements and waiting triggers still require meaning the table does not
 * have. A prepared stack ability does carry its accepted instructions, and
 * continuing that resolution comes before the next state-based checkpoint.
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
	if (!mulligansSettled(table)) return nextOpening(table);

	// Once resolution begins, its remaining instructions finish before another
	// state-based check or priority grant, even across an unanswered choice.
	if (table.resolution) return resolving(table);

	// 3. The loop applies the whole group, then asks again for cascading actions.
	//    Listing the group must not execute it.
	const automatic = stateBased(table);
	if (automatic) return automatic;

	// 4. A replacement applies to a pending event: which applies first.
	// 5. Triggers waiting to go on the stack: what order.
	//    Trigger and replacement discovery remain unwritten.

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
			moves: [...priorityMoves(table, holder).filter((move) => legal(table, move)), ...defaultCasts(table, holder)],
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
	execution?: LedgerRow["execution"],
	/** On replay, what the recorded row says entering permanents registered. */
	registered?: Record<string, Registration[]>,
): void {
	const p = pending(table);
	if (p === null) throw new Error("apply was called with nothing pending");
	const move = p.moves.find((candidate) => candidate.option.id === optionId);
	if (!move) {
		throw new Error(
			`No option ${optionId}. Offered: ${p.moves.map((m) => m.option.id).join(", ")}`,
		);
	}
	take(table, p, move, by, why, execution, registered);
}

/** Commit one move and write its ledger row. The only path from a pick to the table. */
function take(
	table: Table,
	p: Pending,
	move: Move,
	by: "engine" | "model" | "judge",
	why: "forced" | "delegated" | "chosen" | "declared" | "fallback",
	execution?: LedgerRow["execution"],
	registered?: Record<string, Registration[]>,
): void {
	if (move.activation) {
		activate(table, move.activation, { picked: move.option.id, offered: p.moves.map((candidate) => candidate.option.id), by, why, ...(execution ? { execution } : {}) }, registered);
		return;
	}
	const changes = [...move.changes, ...bookkeeping(table, p, move)];
	const entered = attach(table, changes, registered);
	// The row goes in first, so every group this decision commits is stamped with
	// a version that includes the decision that caused it. Nothing in `commit`
	// reads the ledger, so the order costs nothing else.
	table.ledger.push({
		seq: table.ledger.length,
		clock: table.cursor.clock + 1,
		...(execution ? { execution } : {}),
		situation: p.situation,
		seat: p.seat,
		offered: p.moves.map((candidate) => candidate.option.id),
		picked: move.option.id,
		by,
		why,
		...(Object.keys(entered).length ? { registered: entered } : {}),
	});
	commit(table, changes, move.reason);
}

/** A listed action and its bookkeeping are one committed event. */
function bookkeeping(table: Table, p: Pending, move: Move): Change[] {
	const id = move.option.id;
	if (p.situation === "priority") {
		const changes: Change[] = [{ do: "turn", action: id === "pass" ? "pass" : "act", who: p.seat, land: move.reason === "play-land" }];
		const top = cardsIn(table, "stack")[0];
		// 608.2b. Targets are checked once, as resolution begins.
		if (id === "pass" && table.cursor.passes + 1 === playing(table).length && top?.ability) changes.push({ do: "resolution", action: "begin", what: top.id,
			...(targetAvailable(top.ability, { view: project(table, top.ability.controller) }) ? {} : { lost: true }) });
		return changes;
	}
	if (p.situation === "turn-based") return [{ do: "turn", action: "complete" }];
	if (p.situation === "pregame") {
		if (id === "keep" || id === "mulligan") return [{ do: "opening", action: "declare", who: p.seat, choice: id }];
		return [{ do: "opening", action: "bottom", who: p.seat }];
	}
	return [];
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
	// Printed toughness only. Counters and continuous effects need the layer walk.
	const dead = cardsIn(table, "battlefield").flatMap((object) => {
		const body = basePT(facts(table, object));
		return body && (body.toughness <= 0 || object.damage >= body.toughness) ? [{ object, zero: body.toughness <= 0 }] : [];
	});
	if (!losing.length && !dead.length) return null;
	return {
		situation: "state-based",
		seat: losing[0]?.id ?? table.cursor.active,
		question: "Apply state-based losses and creature deaths together.",
		moves: [{
			option: { id: `lose:${losing.map((s) => s.id).join(",")}`, label: "Apply state-based losses and creature deaths" },
			changes: [...losing.map((s) => ({ do: "end-game" as const, who: s.id, result: "lose" as const })),
				...dead.map(({ object, zero }) => ({ do: "move" as const, what: object.id, to: "graveyard" as const, reason: zero ? "state-based-action" as const : "destroy" as const }))],
			reason: "state-based-action",
		}],
	};
}


/** Advance only when the current window has no pending decision. */
export function advance(table: Table): void {
	if (table.outcome) return;
	if (pending(table)) throw new Error("Answer the pending decision before advancing");
	if (table.opening === null) begin(table);
	else if (!mulligansSettled(table)) applyDeclared(table);
	else advanceTurn(table);
}
