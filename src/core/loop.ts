/**
 * The game.
 *
 * Serial by construction. One decision is outstanding at a time, so there is no
 * lock, no lease and no turn timer anywhere in this repo.
 *
 * The version is the length of the log. One source, nothing to keep in step.
 */

import { concede } from "./concede.ts";
import { declare } from "./declare.ts";
import { advance, apply, nextDecision } from "./decisions.ts";
import type { Intent } from "./intent.ts";
import { rule } from "./judge.ts";
import type { Player } from "./player.ts";
import type { Table } from "./table.ts";
import type { Decision, Frame, Outcome, SeatId } from "./types.ts";
import { describe, project } from "./view.ts";

export type Watcher = (line: string) => void;

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
	if (decision.situation === "turn-based" || decision.situation === "state-based") return "forced";
	if (decision.situation === "priority" && only.id === "pass") return "forced";
	if (intent?.deck.delegates?.includes(decision.situation)) return "delegated";
	return null;
}

export async function play(
	table: Table,
	players: Record<SeatId, Player>,
	intents: Record<SeatId, Intent>,
	watch?: Watcher,
): Promise<Outcome> {
	// What each seat has already been shown, so a frame's "since" is the part it
	// has not seen. Presentation only: nothing here bears on an outcome, which
	// is why it may live outside the table.
	const seen: Record<SeatId, number> = {};
	let told = 0;

	while (table.outcome === null) {
		const decision = nextDecision(table);

		if (decision === null) {
			// A phase ending is the one place table talk is offered, which keeps
			// the log to at most one line per seat per phase.
			await atPhaseEnd(table, players, watch);
			advance(table);
			continue;
		}

		const why = automatic(decision, intents[decision.seat]);
		if (why) {
			apply(table, decision.options[0]!.id, "engine", why);
			told = report(table, told, watch);
			continue;
		}

		const version = table.log.length;
		const frame = (seat: SeatId): Frame => {
			const view = project(table, seat, seen[seat] ?? 0);
			seen[seat] = version;
			return { seat, version, view };
		};

		for (const other of table.seats) {
			if (other.id === decision.seat) continue;
			players[other.id]?.observe(frame(other.id));
		}

		const player = players[decision.seat];
		if (!player) throw new Error(`Seat ${decision.seat} has nobody to answer it`);

		const answer = await player.answer({ ...frame(decision.seat), decision });

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
					id: `case-${table.log.length}`,
					about: { option: decision.options[0]?.id ?? "" },
					raisedBy: decision.seat,
					claim: answer.claim,
				});
				break;
			case "say":
				table.said.push({ seat: decision.seat, message: answer.message, at: table.log.length });
				break;
			case "concede":
				concede(table, decision.seat);
				break;
			case "ask":
			case "delegate":
				// Both stay at this decision. `ask` is answered by whatever
				// prepared the question, and `delegate` runs a model that
				// produces ordinary answers until another seat acts. Neither
				// passes, and neither changes the table, so the loop comes back
				// to the same decision with a wider list or a written plan.
				break;
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
			version: table.log.length,
			view: project(table, seat.id),
		});
		if (!answer) continue;
		if (answer.kind === "say") {
			table.said.push({ seat: seat.id, message: answer.message, at: table.log.length });
			watch?.(`${seat.name}: ${answer.message}`);
		}
		if (answer.kind === "concede") concede(table, seat.id);
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
