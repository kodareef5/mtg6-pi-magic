/** Turn-based obligations and step boundaries. Kept together past 150 lines
 * so completing an obligation and advancing its step share the same rules. */
import type { Pending } from "./moves.ts";
import { STEPS } from "./steps.ts";
import type { Reason } from "./syntax.ts";
import { cardsIn, playing, seat, type Table } from "./table.ts";

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
export function turnBased(table: Table): Pending | null {
	const cursor = table.cursor;
	if (!table.opening?.done || table.outcome || cursor.stepDone) return null;
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
export function advanceTurn(table: Table): void {
	if (table.outcome) return;
	const cursor = table.cursor;

	// A step whose turn-based action had nothing to do.
	if (!cursor.stepDone) {
		cursor.stepDone = true;
		return;
	}

	const step = cursor.steps[0];
	if (!step) throw new Error("A live turn needs a step");
	const grants = STEPS[step].priority;

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

/** A null decision can also mean setup or granting priority, not a phase ending. */
export function endingPhase(table: Table): boolean {
	const { steps, stepDone, priority, passes } = table.cursor;
	const step = steps[0], next = steps[1];
	if (table.outcome || !table.opening?.done || !step || !stepDone) return false;
	if (STEPS[step].priority && (priority === null || passes < playing(table).length)) return false;
	return !next || STEPS[step].phase !== STEPS[next].phase;
}

export function completeTurnAction(table: Table): void {
	table.cursor.stepDone = table.cursor.steps[0] !== "cleanup" ||
		cardsIn(table, "hand", table.cursor.active).length <= table.format.maxHandSize;
}
