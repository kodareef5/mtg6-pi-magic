/**
 * The game.
 *
 * Serial by construction. One decision is outstanding at a time, so there is no
 * lock, no lease and no turn timer anywhere in this repo.
 *
 * The version is the table's revision, which is what a stale pick has to be
 * caught against: anything that commits moves it, whether or not a decision was
 * answered. A seat's recent receipts are derived from its recorded decisions,
 * so a resumed game supplies the same window as uninterrupted play.
 * Past 150 lines to keep answer dispatch and recovery in the same serial loop.
 */

import { createHash } from "node:crypto";
import { concede } from "./concede.ts";
import { declare } from "./declare.ts";
import { advance, apply, nextDecision } from "./decisions.ts";
import type { Intent } from "./intent.ts";
import type { Case, Ruling } from "./judge.ts";
import { rollback } from "./journal.ts";
import { refuse, PlayerUnavailable, type Answer, type Player } from "./player.ts";
import type { Table } from "./table.ts";
import { endingPhase } from "./turn.ts";
import type { Decision, Frame, Outcome, SeatId } from "./types.ts";
import { describe, project, sinceDecision } from "./view.ts";
import { annotate, execution, planReason, planState, type PlanState } from "./planning.ts";
import { editWork, prepareWork, recordWork, workFrame } from "./work-tools.ts";
import { activate } from "./procedures.ts";
import { mulligansSettled } from "./pregame.ts";

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
export type PlayOptions = {
	watch?: Watcher;
	/** Synchronous host boundary before the next operation, including bookkeeping. Throwing leaves the game pending. */
	checkpoint?: () => void;
	onTurn?: TurnWatcher;
	/** Presentation only, including the first turn after the opening. */
	onTurnStart?: (turn: number, active: SeatId) => void;
	workBudget?: number;
	judge?: Judge;
};

/**
 * When the table may act without asking, and why.
 *
 * Untapping, the turn draw and state-based actions follow the rules. Priority
 * belongs to the seat, even when the offered list contains only a pass: the
 * seat can ask for help or object before passing. A plan guides its choices;
 * a unique match in that plan does not authorize the table to choose.
 *
 * A card's instruction belongs to the seat resolving it. If a seat is to draw a
 * card from an effect and does not, that is its business. The table could have
 * mentioned it, and the view does mention it, but it does not reach over and do
 * it. A seat that wants that may hand it over in its intent, and then it is
 * recorded as `delegated` rather than as `forced`, because the two are not the
 * same claim.
 */
function automatic(decision: Decision, intent?: Intent): "forced" | "delegated" | null {
	if (decision.situation === "priority" || decision.options.some((one) => one.id === "attack:done" || one.id === "block:done")) return null;
	if (decision.options.length !== 1) return null;
	if (["turn-based", "state-based", "pregame", "trigger-order"].includes(decision.situation)) return "forced";
	if (intent?.deck.delegates?.includes(decision.situation)) return "delegated";
	return null;
}

/** Null means the table is waiting on an unanswered selection or unavailable route. */
export async function play(
	table: Table,
	players: Record<SeatId, Player>,
	intents: Record<SeatId, Intent>,
	{ watch, checkpoint, onTurn, onTurnStart, workBudget = 32, judge }: PlayOptions = {},
): Promise<Outcome | null> {
	if (!Number.isSafeInteger(workBudget) || workBudget < 1) throw new Error("The work edit budget must be a positive integer.");
	let told = 0;
	let began = table.log.length;
	let walk: { version: number; edits: number } | undefined;
	let observedTurn: string | undefined;
	// Positions each seat has met in the current step, to notice a seat that keeps returning to the same one.
	let positions: { step: string; seen: Map<string, number> } | undefined;

	while (table.outcome === null) {
		checkpoint?.();
		const turn = `${table.cursor.turn}:${table.cursor.active}`;
		if (onTurnStart && turn !== observedTurn && mulligansSettled(table)) {
			observedTurn = turn;
			tell(table, onTurnStart, table.cursor.turn, table.cursor.active, table.log.length);
		}
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
				// Every seat sees the new turn begin, however its decisions go: forced and delegated play asks nobody.
				for (const one of table.seats) {
					const view = project(table, one.id, sinceDecision(table, one.id));
					players[one.id]?.observe({ seat: one.id, version: table.cursor.clock, view });
				}
			}
			continue;
		}

		// Strategy maintains the plan. The player executes its voluntary actions.
		const current = table.work[decision.seat] ? workFrame(table, decision.seat) : undefined;
		const attention = !!current && planReason(current) !== undefined;
		const state = current && !attention ? planState(current) : null;
		if (state && raiseStop(table, decision, state)) continue;
		// Planning and announcements must remain available beside compulsory work.
		const why = attention || state?.procedures.length ? null : automatic(decision, intents[decision.seat]);
		if (why) {
			// A forced move can still be the step the plan named; the row says so.
			apply(table, decision.options[0]!.id, "engine", why, state ? execution(state, decision.options[0]!.id) : undefined);
			told = report(table, told, watch);
			continue;
		}
		const version = table.cursor.clock;
		if (walk?.version !== version) walk = { version, edits: table.workLog.filter((entry) => entry.clock === version && entry.seat === decision.seat && entry.tools?.length).length };
		if (walk.edits >= workBudget) {
			const gap = `Seat ${decision.seat}: work edit budget ${workBudget} exhausted at version ${version}; decision remains pending. No pass or completion was chosen.`;
			if (table.gaps.at(-1) !== gap) table.gaps.push(gap);
			report(table, told, watch);
			return null;
		}
		const frame = (seat: SeatId): Frame => {
			const view = project(table, seat, sinceDecision(table, seat));
			return { seat, version, view };
		};

		for (const other of table.seats) {
			if (other.id === decision.seat) continue;
			players[other.id]?.observe(frame(other.id));
		}

		const player = players[decision.seat];
		if (!player) throw new Error(`Seat ${decision.seat} has nobody to answer it`);

		// A seat back at the same decision in the same position, under the same plan, is going round in circles:
		// declaring and withdrawing a block, say. It is told; at the third visit strategy is asked, as a stop would;
		// past the turn's requests the game stops with a gap instead of running on. Nothing is chosen for the seat.
		const step = `${table.cursor.turn}:${table.cursor.active}:${table.cursor.steps[0] ?? ""}`;
		if (positions?.step !== step) positions = { step, seen: new Map() };
		const key = createHash("sha256").update(JSON.stringify([decision.seat, decision.situation, decision.question, decision.options.map((one) => one.id).sort(),
			[...table.things], table.combat ?? null, table.waiting.map((one) => one.id), table.resolution ?? null, table.work[decision.seat]?.revision ?? 0])).digest("hex");
		const repeated = (positions.seen.get(key) ?? 0) + 1;
		positions.seen.set(key, repeated);
		if (repeated >= LOOP) {
			const reason = `Loop: this seat has met the same decision in the same position ${repeated} times this step (${decision.question}). Its answers lead back to it without progress.`;
			if (escalations(table, decision.seat) < ESCALATIONS && table.work[decision.seat] && !attention) {
				editWork(table, decision.seat, [{ do: "plan.request", reason }], `loop-${decision.seat}-${version}`);
				told = report(table, told, watch);
				continue;
			}
			table.gaps.push(`Seat ${decision.seat}: ${reason} This turn's requests for a new plan are spent, so play stops here; no action was chosen.`);
			report(table, told, watch);
			return null;
		}

		// Retry the same decision, and say what was wrong with the last answer.
		// Asking the identical question twice is one question, not two. A plan's
		// announcements join the listed options, each marked with what the plan says.
		const offered: Decision = state ? { ...decision, options: annotate(decision.options, state) } : decision;
		const asked = { ...frame(decision.seat), decision: offered, ...(repeated > 1 ? { repeated } : {}) };
		let answer: Answer | undefined;
		const failures: string[] = [];
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const received = await player.answer(failures.length ? { ...asked, refused: [...failures] } : asked);
				let why = refuse(received, offered);
				if (why === null && decision.preparation?.length && (received as Answer).kind === "pick")
					why = `Prepare the known uses of ${decision.preparation.map((one) => one.card).join(", ")} with seat work before choosing an action or passing.`;
				if (why === null && (received as Answer).kind === "work") {
					const valid = received as Extract<Answer, { kind: "work" }>;
					const delivered = table.workLog.find((entry) => entry.seat === decision.seat && entry.actionId === valid.actionId);
					if (delivered) why = JSON.stringify(delivered.tools) === JSON.stringify(valid.tools) ? null : "This actionId already names different seat tools.";
					else if (valid.revision !== (table.work[decision.seat]?.revision ?? 0)) why = "The seat equipment changed; inspect it again.";
					else if (!attention && valid.tools.every((tool) => tool.do === "plan.request") && escalations(table, decision.seat) >= ESCALATIONS) why = `This turn's ${ESCALATIONS} requests for a new plan are spent. Choose a listed option.`;
					else prepareWork(workFrame(table, decision.seat), valid.tools);
				}
				if (why === null) { answer = received as Answer; break; }
				failures.push(why);
			} catch (error) {
				if (error instanceof PlayerUnavailable) {
					table.gaps.push(`Seat ${decision.seat} unavailable: ${error.message} Decision remains pending; no action was chosen.`);
					report(table, told, watch);
					return null;
				}
				failures.push(String(error));
			}
		}
		if (!answer && decision.preparation?.length) {
			table.gaps.push(`Seat ${decision.seat}, card preparation: ${failures.join(" Then: ")} Decision remains pending; no action was chosen.`);
			report(table, told, watch);
			return null;
		}
		if (!answer && attention) {
			// Strategy gave nothing usable: the game goes on under the plan already standing, and the gap says so.
			table.gaps.push(`Seat ${decision.seat}, strategy: ${failures.join(" Then: ")} The standing plan is kept. Play goes on.`);
			editWork(table, decision.seat, [{ do: "plan.keep", reason: failures.at(-1) ?? "no plan" }], `keep-${decision.seat}-${version}-${table.work[decision.seat]?.revision ?? 0}`);
			walk.edits += 1;
			told = report(table, told, watch);
			continue;
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

		// An objection is ruled on before anything else in the answer: a rollback leaves nothing for it to apply to.
		const objection = answer.kind === "object" ? answer : answer.kind === "work" ? answer.objection : undefined;
		if (objection && await object(table, { row: objection.row, raisedBy: decision.seat, claim: objection.claim, ...(objection.rule ? { rule: objection.rule } : {}) }, judge)) {
			for (const player of Object.values(players)) player.reset?.();
			told = table.log.length;
			continue;
		}

		switch (answer.kind) {
			case "work":
				editWork(table, decision.seat, answer.tools, answer.actionId, answer.revision);
				break;
			case "pick": {
				const procedure = state?.procedures.find((choice) => choice.option.id === answer.option);
				const carried = state ? execution(state, answer.option) : undefined;
				if (procedure) activate(table, procedure.activation, { picked: answer.option, offered: offered.options.map((option) => option.id), by: "model", why: "chosen", ...(carried ? { execution: carried } : {}) });
				else apply(table, answer.option, "model", "chosen", carried);
				break;
			}
			case "declare":
				declare(table, decision.seat, answer.changes, answer.says);
				break;
			case "object":
				// Ruled above; the decision is still this seat's to answer.
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

		// An answer that left the table where it was spent one of this version's equipment edits.
		if (table.cursor.clock === version) walk.edits += 1;
		told = report(table, told, watch);
	}

	told = report(table, told, watch);
	return table.outcome;
}

/**
 * The judge a game may have: it rules on an objection, and a rollback rebuilds
 * the table from `restart`, a fresh table for the same seats, decks and seed.
 * `flush` saves whatever records the game before a rollback shortens it.
 */
export type Judge = { rule(table: Table, open: Case): Promise<Ruling>; restart(): Table; flush?(): void };

/**
 * Rule on one objection. True when the game went back: the table is rebuilt to
 * just before the action, and every seat with a plan is asked for a new one.
 * The judge decides; the seats are not asked to agree. A ruling that leaves the
 * action standing is recorded and play goes on.
 */
async function object(table: Table, open: Case, judge?: Judge): Promise<boolean> {
	const row = table.ledger[open.row];
	if (!row || row.seat === open.raisedBy) {
		table.gaps.push(`Seat ${open.raisedBy} objected to action ${open.row}, which is not another seat's recorded action.`);
		return false;
	}
	if (!judge) { table.gaps.push(`Seat ${open.raisedBy} objected to action ${open.row}, and this game has no judge.`); return false; }
	let ruling: Ruling;
	try { ruling = await judge.rule(table, open); } catch (error) {
		table.rulings.push({ case: structuredClone(open), ruling: null, failed: error instanceof Error ? error.message : String(error), at: table.ledger.length });
		table.gaps.push(`The judge could not rule on seat ${open.raisedBy}'s objection to action ${open.row}: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
	if (ruling.legal || ruling.remedy === "stand") { table.rulings.push({ case: open, ruling, at: table.ledger.length }); return false; }
	judge.flush?.();
	rollback(table, { case: open, ruling }, judge.restart);
	const said = `The judge ruled action ${open.row} illegal (${ruling.rule}: ${ruling.because}) and the game went back to just before it. Plan from here.`;
	for (const seat of table.seats) if (table.work[seat.id]) editWork(table, seat.id, [{ do: "plan.request", reason: said }], `ruling-${table.rulings.length}-${seat.id}`);
	return true;
}

/** Visits to the same decision in the same position, within a step and under one plan, that mean a seat is going round in circles. */
const LOOP = 3;
/** Requests for a new plan a seat may make in one turn, by stops or by asking for help. Past it, the pilot decides. */
const ESCALATIONS = 2;
const escalations = (table: Table, seat: SeatId) => table.workLog.filter((entry) => entry.seat === seat &&
	entry.clock > (table.cursor.began[table.cursor.active] ?? 0) && entry.tools?.some((tool) => tool.do === "plan.request")).length;

/**
 * A stop the table raises for the seat: an `askWhen` that has become true.
 * Each is raised once a turn, within the escalation budget. True when it raised
 * one. A step that cannot be taken now is passed over, not a stop: many steps
 * are "if able", and the plan's own stops say when the line is broken.
 */
function raiseStop(table: Table, decision: Decision, state: PlanState): boolean {
	// A stop that held when its plan was accepted arms the first time it is false.
	const work = table.work[decision.seat]!;
	if (state.arming.length) {
		const unarmed = (work.unarmed ?? []).filter((label) => !state.arming.includes(label));
		const { unarmed: _, ...rest } = work;
		recordWork(table, decision.seat, { ...rest, ...(unarmed.length ? { unarmed } : {}) }, `arm-${decision.seat}-${table.cursor.clock}`, `armed: ${state.arming.join("; ")}`);
	}
	for (const reason of state.stops.map((label) => `Stop: ${label}`)) {
		if (escalations(table, decision.seat) >= ESCALATIONS) return false;
		const actionId = `stop-${decision.seat}-${table.cursor.turn}-${reason}`;
		if (table.workLog.some((entry) => entry.seat === decision.seat && entry.actionId === actionId)) continue;
		editWork(table, decision.seat, [{ do: "plan.request", reason }], actionId);
		return true;
	}
	return false;
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
