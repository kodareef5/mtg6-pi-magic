/**
 * What is pending at the table, and what happens when a seat picks.
 *
 * `nextDecision` is a pure function of the table. Every pending decision can be
 * listed without executing anything, which is what makes a decision testable
 * and a game replayable. An earlier engine found decisions by falling through
 * nested async calls, so a bug in the twentieth branch was unreachable from a
 * test. design-ref/CIRCUITRY.md sections 1 to 4.
 *
 * The control flow here is real. The leaves throw until they are written.
 *
 * Long for this repo, and it stays one file: the nine checks are one ordered
 * thought, and splitting them is how an engine ends up running them in a
 * convenient order instead of the one the rules fix.
 */

import { applyDeclared, begin, bottomOptions, declareOptions } from "./pregame.ts";
import type { Change, Reason } from "./syntax.ts";
import { cardsIn, commit, playing, seat, type Table } from "./table.ts";
import type { Decision, Option, SeatId, Situation } from "./types.ts";

/** An option with the changes behind it. The changes never leave this module. */
type Move = { option: Option; changes: Change[]; reason: Reason };

type Pending = {
	situation: Situation;
	seat: SeatId;
	question: string;
	moves: Move[];
};

/** Steps nobody receives priority in. 117.3a and 514.3. */
const NO_PRIORITY = new Set(["untap", "cleanup"]);

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
	if (!table.opening.done) return opening(table);

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
			moves: priorityMoves(table, holder).filter((move) => legal(table, move)),
		};
	}

	// 9. Nothing pending. The caller advances the clock.
	return null;
}

export function nextDecision(table: Table): Decision | null {
	const p = pending(table);
	if (p === null) return null;
	return {
		situation: p.situation,
		seat: p.seat,
		question: p.question,
		options: p.moves.map((move) => move.option),
	};
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
		cursor.stepDone = true;
		return;
	}

	if (p.situation === "pregame" && table.opening) {
		if (id === "keep" || id === "mulligan") table.opening.declared[p.seat] = id;
		if (id.startsWith("bottom:")) {
			const owes = (table.opening.owed[p.seat] ?? 1) - 1;
			if (owes > 0) table.opening.owed[p.seat] = owes;
			else delete table.opening.owed[p.seat];
			if (
				table.opening.kept.length === table.seats.length &&
				Object.keys(table.opening.owed).length === 0
			) {
				table.opening.done = true;
			}
		}
	}
}

/**
 * Situation 7, in this order: put cards on the bottom, declare, then any
 * opening-hand action. pregame.ts owns the procedure and docs/MULLIGAN.md owns
 * the reasoning.
 */
function opening(table: Table): Pending | null {
	const round = table.opening!;

	// A seat owing cards to the bottom answers before anything else, because
	// its hand is not an opening hand until it does.
	for (const s of table.seats) {
		if ((round.owed[s.id] ?? 0) > 0) {
			return {
				situation: "pregame",
				seat: s.id,
				question: `Put ${round.owed[s.id]} card${round.owed[s.id] === 1 ? "" : "s"} on the bottom of your library.`,
				moves: bottomOptions(table, s.id).map((option) => ({
					option,
					changes: [
						{
							do: "move",
							what: option.id.slice("bottom:".length),
							to: "library",
							position: "bottom",
							reason: "game-setup",
						},
					],
					reason: "game-setup" as Reason,
				})),
			};
		}
	}

	// 103.5: the starting player declares, then each other seat in turn order.
	for (const s of table.seats) {
		if (round.kept.includes(s.id)) continue;
		if (round.declared[s.id]) continue;
		return {
			situation: "pregame",
			seat: s.id,
			question: `Keep this hand of ${cardsIn(table, "hand", s.id).length}?`,
			moves: declareOptions(table, s.id).map((option) => ({
				option,
				changes: [],
				reason: "game-setup" as Reason,
			})),
		};
	}

	// Every seat has declared. advance applies the round, because taking the
	// mulligans is not a decision.
	return null;
}

/** Situation 1. The table knows all of this without reading a card. */
function priorityMoves(table: Table, holder: SeatId): Move[] {
	const moves: Move[] = [
		{ option: { id: "pass", label: "Pass" }, changes: [], reason: "game-setup" },
	];

	// Playing a land: one move per land in hand, when this seat has played
	// fewer than it may, it is this seat's main phase and the stack is empty.
	// Playing a land does not use the stack. 305.1.
	const step = table.cursor.steps[0] ?? "";
	const main = step === "precombat-main" || step === "postcombat-main";
	if (main && table.cursor.active === holder && seat(table, holder).landsPlayed < 1) {
		for (const card of cardsIn(table, "hand", holder)) {
			if (!isLand(table, card.card)) continue;
			moves.push({
				option: { id: `land:${card.id}`, label: `Play ${card.card}` },
				changes: [{ do: "move", what: card.id, to: "battlefield", reason: "play-land" }],
				reason: "play-land",
			});
		}
	}

	// Later: cast a spell once per distinct cost configuration, activate an
	// ability, take a special action. A kicked and an unkicked spell are two
	// moves, not one move with a blank to fill in. That is what stops a model
	// writing a cost.

	// Canonical order: pass, then lands by card name then by id. Same table,
	// same list, same order, so a seed replays.
	return [
		moves[0]!,
		...moves.slice(1).sort((a, b) => a.option.label.localeCompare(b.option.label) || a.option.id.localeCompare(b.option.id)),
	];
}

/** The engine knows a basic land's mana ability without reading its text. */
const isLand = (table: Table, card: string) => card === "Forest" || card === "Swamp" || card === "Island" || card === "Mountain" || card === "Plains";

/**
 * A move is offered only when every one of these holds. This is the whole
 * notion of legality and none of it reads printed text.
 *
 * 1. The seat may act in this window.
 * 2. The cost is locked and a payment plan exists.
 * 3. Every target has at least its minimum of legal objects in this seat's view.
 * 4. Every amount evaluates, and every binding it reads was declared earlier.
 * 5. No limit is exhausted, read off the marker rather than remembered.
 * 6. No standing restriction forbids it.
 * 7. The changes apply cleanly to a trial copy of the table.
 *
 * Milestone one checks what it has: every object a move names is still where
 * the move thinks it is. Costs, targets, limits and restrictions arrive with
 * cards, and the trial application arrives with them, because cloning the
 * table per option only earns its cost once a move can fail in a way the
 * builder did not foresee.
 */
function legal(table: Table, move: Move): boolean {
	return move.changes.every((change) => !("what" in change) || table.things.has(change.what));
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

/**
 * Situation 2. Untap, draw for the turn, declare attackers and blockers,
 * assign combat damage, discard to hand size.
 *
 * Nobody is asked when there is one lawful answer, and most untap steps, most
 * discards and most damage assignments have exactly one. Untapping looks
 * mechanical and is not: a permanent may refuse, an effect may cap how many,
 * and untapping may cost something. Milestone one has none of those, so it
 * untaps everything in one move.
 */
function turnBased(table: Table): Pending | null {
	const cursor = table.cursor;
	if (cursor.stepDone) return null;
	const step = cursor.steps[0] ?? "";
	const active = seat(table, cursor.active);

	if (step === "untap") {
		const tapped = cardsIn(table, "battlefield").filter((t) => t.controller === active.id && t.tapped);
		if (!tapped.length) return null;
		return {
			situation: "turn-based",
			seat: active.id,
			question: "Untap.",
			moves: [
				{
					option: { id: "untap", label: `Untap ${tapped.length}` },
					changes: tapped.map((t) => ({ do: "untap" as const, what: t.id })),
					reason: "state-based-action",
				},
			],
		};
	}

	if (step === "draw") {
		// 103.8a: in a two-player game the seat that plays first skips the draw
		// step of its first turn.
		const first = table.seats[0]?.id;
		if (cursor.turn === 1 && active.id === first && table.seats.length === 2) return null;
		const top = cardsIn(table, "library", active.id)[0];
		return {
			situation: "turn-based",
			seat: active.id,
			question: "Draw for the turn.",
			moves: [
				{
					option: { id: "draw", label: top ? "Draw a card" : "Draw from an empty library" },
					// 704.5b: the attempt is what loses the game, so it is
					// recorded even though nothing moves.
					changes: top
						? [{ do: "move" as const, what: top.id, to: "hand" as const, reason: "draw" as const }]
						: [{ do: "mark-player" as const, who: active.id, key: "drew-from-empty", add: 1 }],
					reason: "draw",
				},
			],
		};
	}

	// 514.1: the active player discards down to maximum hand size, one card at
	// a time so the option list stays readable.
	if (step === "cleanup") {
		const hand = cardsIn(table, "hand", active.id);
		const over = hand.length - table.format.maxHandSize;
		if (over <= 0) return null;
		return {
			situation: "turn-based",
			seat: active.id,
			question: `Discard ${over} card${over === 1 ? "" : "s"}.`,
			moves: hand.map((card) => ({
				option: {
					id: `discard:${card.id}`,
					label: `Discard ${card.card}`,
					...(over > 1 ? { shows: `${over} still to go` } : {}),
				},
				changes: [{ do: "move" as const, what: card.id, to: "graveyard" as const, reason: "cleanup-discard" as const }],
				reason: "cleanup-discard" as Reason,
			})),
		};
	}

	return null;
}

/** Nothing is pending. Do what is automatic and move the clock on. */
export function advance(table: Table): void {
	if (table.outcome) return;
	const cursor = table.cursor;

	// The hands come first, and taking the declared mulligans is not a decision.
	if (table.opening === null) {
		begin(table);
		return;
	}
	if (!table.opening.done) {
		applyDeclared(table);
		return;
	}

	// A step whose turn-based action had nothing to do.
	if (!cursor.stepDone) {
		cursor.stepDone = true;
		return;
	}

	const step = cursor.steps[0] ?? "";
	const grants = !NO_PRIORITY.has(step);

	// 117.3a: the active player receives priority after the turn-based actions.
	if (grants && cursor.priority === null) {
		cursor.priority = cursor.active;
		cursor.passes = 0;
		return;
	}

	// A phase ends when every seat passes in succession with nothing waiting.
	// It is consensus, not a clock.
	if (grants && cursor.passes < playing(table).length) return;

	endStep(table);
}

function endStep(table: Table): void {
	const cursor = table.cursor;
	const step = cursor.steps.shift() ?? "";

	// Pools empty at every step and phase boundary, so a surplus floated in a
	// main phase does not reach combat. 500.4.
	for (const s of table.seats) s.pool = [];

	if (step === "cleanup") {
		// 514.2: marked damage is removed and until-end-of-turn notes end,
		// simultaneously.
		for (const t of table.things.values()) t.damage = 0;
		table.notes = table.notes.filter((note) => note.until !== "end-of-turn");
	}

	cursor.stepDone = false;
	cursor.priority = null;
	cursor.passes = 0;

	if (cursor.steps.length === 0) {
		const order = playing(table);
		const at = order.findIndex((s) => s.id === cursor.active);
		cursor.active = order[(at + 1) % order.length]?.id ?? cursor.active;
		cursor.steps = [...table.format.steps];
		cursor.turn += 1;
		cursor.began[cursor.active] = cursor.clock;
		for (const s of table.seats) s.landsPlayed = 0;
	}
}
