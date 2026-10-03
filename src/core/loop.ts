/**
 * The game.
 *
 * Serial by construction. One decision is outstanding at a time, so there is no
 * lock, no lease and no turn timer anywhere in this repo.
 *
 * The version is the table's revision, which is what a stale pick has to be
 * caught against: anything that commits moves it, whether or not a decision was
 * answered. How much of the log a seat has read is a different number and is
 * tracked here, because nothing about it bears on an outcome.
 * Past 150 lines to keep answer dispatch and recovery in the same serial loop.
 */

import { concede } from "./concede.ts";
import { declare } from "./declare.ts";
import { advance, apply, nextDecision } from "./decisions.ts";
import type { Intent } from "./intent.ts";
import { rule } from "./judge.ts";
import { refuse, type Answer, type Player } from "./player.ts";
import type { Table } from "./table.ts";
import { endingPhase } from "./turn.ts";
import type { Decision, Frame, Outcome, SeatId } from "./types.ts";
import { describe, project } from "./view.ts";

export type Watcher = (line: string) => void;

/**
 * Called when a turn ends, with the turn that ended, the seat that was active,
 * and the log length it began at.
 *
 * Presentational, like `watch`, and for the same reason: the table does not
 * know that anybody summarises a turn, and nothing it returns bears on the
 * game.
 *
 * Not awaited. The thing that reads this makes a model call, and a loop that
 * waited for one at every turn boundary would run an order of magnitude slower
 * than the game it is narrating. A hook that wants to do slow work starts it
 * and returns; whatever it returns is dropped, and a rejection becomes a gap
 * rather than a crash.
 */
export type TurnWatcher = (turn: number, active: SeatId, from: number) => Promise<void> | void;

/**
 * When the table may act without asking, and why.
 *
 * The table owns the turn. Untapping, drawing for the turn, state based actions
 * and a priority window with nothing in it but a pass belong to the rules, and
 * taking them silently decides nothing a seat would want back. That is
 * `forced`, and it is most decisions in a game, which is the difference between
 * a game costing cents and one costing dollars.
 *
 * A card's instruction belongs to the seat resolving it. If a seat is to draw a
 * card from an effect and does not, that is its business. The table could have
 * mentioned it, and the view does mention it, but it does not reach over and do
 * it. A seat that wants that may hand it over in its intent, and then it is
 * recorded as `delegated` rather than as `forced`, because the two are not the
 * same claim.
 */
function automatic(decision: Decision, intent?: Intent): "forced" | "delegated" | null {
	if (decision.options.length !== 1) return null;
	const only = decision.options[0]!;
	if (["turn-based", "state-based", "pregame"].includes(decision.situation)) return "forced";
	if (decision.situation === "priority" && only.id === "pass") return "forced";
	if (intent?.deck.delegates?.includes(decision.situation)) return "delegated";
	return null;
}

/** Null means the table is waiting on an unanswered selection or unavailable route. */
export async function play(
	table: Table,
	players: Record<SeatId, Player>,
	intents: Record<SeatId, Intent>,
	watch?: Watcher,
	onTurn?: TurnWatcher,
): Promise<Outcome | null> {
	// What each seat has already been shown, so a frame's "since" is the part it
	// has not seen. Presentation only: nothing here bears on an outcome, which
	// is why it may live outside the table.
	const seen: Record<SeatId, number> = {};
	let told = 0;
	let began = table.log.length;

	while (table.outcome === null) {
		const decision = nextDecision(table);

		if (decision === null) {
			// A phase ending is the one place table talk is offered, which keeps
			// the log to at most one line per seat per phase.
			if (endingPhase(table)) await atPhaseEnd(table, players, watch);
			const { turn, active } = table.cursor;
			advance(table);
			if (table.cursor.turn !== turn) {
				tell(table, onTurn, turn, active, began);
				began = table.log.length;
			}
			continue;
		}

		const why = automatic(decision, intents[decision.seat]);
		if (why) {
			apply(table, decision.options[0]!.id, "engine", why);
			told = report(table, told, watch);
			continue;
		}

		const version = table.cursor.clock;
		const frame = (seat: SeatId): Frame => {
			const view = project(table, seat, seen[seat] ?? 0);
			seen[seat] = table.log.length;
			return { seat, version, view };
		};

		for (const other of table.seats) {
			if (other.id === decision.seat) continue;
			players[other.id]?.observe(frame(other.id));
		}

		const player = players[decision.seat];
		if (!player) throw new Error(`Seat ${decision.seat} has nobody to answer it`);

		// Retry the same decision, and say what was wrong with the last answer.
		// Asking the identical question twice is one question, not two.
		const asked = { ...frame(decision.seat), decision };
		let answer: Answer | undefined;
		const failures: string[] = [];
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const received = await player.answer(failures.length ? { ...asked, refused: [...failures] } : asked);
				const why = refuse(received, decision);
				if (why === null) { answer = received as Answer; break; }
				failures.push(why);
			} catch (error) {
				failures.push(String(error));
			}
		}
		if (!answer) {
			const terminal = decision.options.find((option) => option.id === decision.fallback);
			table.gaps.push(`Seat ${decision.seat}, ${decision.situation}: ${failures.join(" Then: ")} ` +
				(terminal ? `Fallback: ${terminal.id}.` : "Selection remains pending; no terminating option."));
			if (!terminal) { report(table, told, watch); return null; }
			apply(table, terminal.id, "engine", "fallback");
			told = report(table, told, watch);
			continue;
		}

		switch (answer.kind) {
			case "pick":
				apply(table, answer.option, "model", "chosen");
				break;
			case "declare":
				declare(table, decision.seat, answer.changes, answer.says);
				break;
			case "object":
				// Any seat may object, whoever holds priority. The contested move
				// waits. A ruling is recorded against the case, and the next pass
				// of the loop reads whatever table the ruling left.
				rule(table, {
					id: `case-${table.cursor.clock}`,
					about: { option: decision.options[0]?.id ?? "" },
					raisedBy: decision.seat,
					claim: answer.claim,
				});
				break;
			case "say":
				table.said.push({ seat: decision.seat, message: answer.message, at: table.ledger.length });
				break;
			case "concede":
				concede(table, decision.seat);
				break;
			case "ask":
			case "delegate":
				table.gaps.push(`Seat ${decision.seat}: ${answer.kind} is not implemented. The decision remains pending.`);
				report(table, told, watch);
				return null;
		}

		told = report(table, told, watch);
	}

	told = report(table, told, watch);
	return table.outcome;
}

/**
 * Offer every seat a message or a concession, in seat order, and take at most
 * one answer each. Null is the expected answer and costs nothing.
 */
async function atPhaseEnd(
	table: Table,
	players: Record<SeatId, Player>,
	watch?: Watcher,
): Promise<void> {
	for (const seat of table.seats) {
		const player = players[seat.id];
		if (!player?.interject) continue;
		const answer = await player.interject({
			seat: seat.id,
			version: table.cursor.clock,
			view: project(table, seat.id),
		});
		if (!answer) continue;
		if (answer.kind === "say") {
			table.said.push({ seat: seat.id, message: answer.message, at: table.ledger.length });
			watch?.(`${seat.name}: ${answer.message}`);
		}
		if (answer.kind === "concede") concede(table, seat.id);
	}
}

/**
 * Call the turn hook and keep going. Nothing in the game waits on it, and a
 * hook that throws is the hook's bug and not the end of the game.
 */
function tell(table: Table, onTurn: TurnWatcher | undefined, turn: number, active: SeatId, from: number): void {
	if (!onTurn) return;
	try {
		void Promise.resolve(onTurn(turn, active, from)).catch(
			(error: unknown) => void table.gaps.push(`Turn ${turn} hook failed: ${String(error)}`),
		);
	} catch (error) {
		table.gaps.push(`Turn ${turn} hook failed: ${String(error)}`);
	}
}

/**
 * Read the newest receipts out loud, so a reader sees the game as it happens.
 *
 * This reader is the table's own and is read by whoever is watching, so it says
 * public facts only. `describe` is what holds that line: a move between two
 * hidden zones says that it happened and not which card it was.
 */
function report(table: Table, told: number, watch?: Watcher): number {
	if (!watch) return table.log.length;
	for (const receipt of table.log.slice(told)) {
		const line = describe(table, receipt);
		if (line) watch(line);
	}
	return table.log.length;
}
