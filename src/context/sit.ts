/**
 * Seating a whole table of model-backed seats.
 *
 * One place that turns a resolved roster into a playable table, so `/magic play`
 * and `tools/smoke.ts` do not each assemble it differently and then disagree
 * about what a game costs.
 *
 * The order is the cost order. The pregame runs once, concurrently across every
 * seat and every question. The decision model runs per asked decision. The
 * commentator runs once per turn that had anything in it. Experimental circuits
 * request strategy to prepare or revise private equipment. The judge still
 * stops at a verdict because its remedy is unwritten.
 */

import type { Api, ClassifierApi, ClassifierModel, Model } from "@earendil-works/pi-ai";

import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import { keep, save, type Journal } from "../core/journal.ts";
import type { Intent } from "../core/intent.ts";
import { play, type Watcher } from "../core/loop.ts";
import type { Player } from "../core/player.ts";
import type { Seat, Table } from "../core/table.ts";
import type { Outcome, SeatId } from "../core/types.ts";
import { brief, emptyBrief, type Brief } from "./brief.ts";
import { decisionApi, type Classify } from "./model.ts";
import type { Chronicle } from "./packet.ts";
import { startingIntent } from "./plan.ts";
import { reasoner, type Stream } from "./reason.ts";
import type { Cast, Role } from "./roles.ts";
import { bill, tally, type Spend, type Tally } from "./spend.ts";
import { aiSeat } from "./seat.ts";
import { recap, type Recap } from "./summary.ts";
import { planWork, interpretCards } from "./strategy.ts";
import { editWork } from "../core/work-tools.ts";

/** What Pi gives us, narrowed to the two calls a game makes. */
export type Inference = { classify: Classify; stream: Stream };

export type Seated = {
	players: Record<SeatId, Player>;
	intents: Record<SeatId, Intent>;
	chronicle: Chronicle;
	tally: Tally;
	/** Requests to the decision model, attempts included. Read from the bill. */
	picks: () => number;
	/** Routes followed, by route id. Beside the bill, because a dial is a request. */
	dials: Record<string, number>;
};

const pick = (parts: Cast[], role: Role) => parts.find((part) => part.role === role);

/**
 * Give every seat a model to answer with, and run the pregame.
 *
 * It refuses rather than starting half ready. A seat whose `decide` role did not
 * resolve has nothing to answer it, and a game that starts anyway spends its
 * first decision finding that out.
 *
 * A seat whose `pregame` role did not resolve plays with no brief. That is a
 * quality cost and not a reason to refuse: a missing plan loses a seat some
 * edge, and a refused game loses it everything.
 */
export async function seat(
	table: Table,
	rosters: (seat: SeatId) => Promise<Cast[]>,
	inference: Inference,
	universe: Universe,
	options: {
		format: string;
		/**
		 * The rules, so a seat can look one up mid decision. Absent is a table
		 * with no dialer, which still plays.
		 */
		rules?: Rules;
		/** How many routes a seat may follow per decision. */
		dials?: number;
		/** Experimental recipes and scheduled reviews. One strategy request to begin. */
		circuits?: boolean;
		/** Written to as the game runs, so a clone of this game is a prefix of it. */
		journal?: Journal;
		/**
		 * Briefs a clone carried. A seat whose brief is here is not asked for one
		 * again, which is the whole point of cloning at version zero. They are
		 * used as given: a clone is the same game continued, so there is nothing
		 * to check them against.
		 */
		prepared?: { seat: SeatId; made: unknown }[];
	},
): Promise<Seated> {
	const counted = tally();
	const dialled: Record<string, number> = {};
	const chronicle: Chronicle = { briefs: {}, recaps: [] };
	const players: Record<SeatId, Player> = {};
	const intents: Record<SeatId, Intent> = {};

	const parts = new Map<SeatId, Cast[]>();
	for (const at of table.seats) parts.set(at.id, await rosters(at.id));

	/**
	 * Take a brief, however it arrived.
	 *
	 * A freshly written one is kept in the journal; a carried one is already in
	 * the journal the clone copied. Either way its failures are reported, which
	 * the reuse path used to skip, so a carried brief with failed questions read
	 * as a clean run.
	 */
	const take = (at: SeatId, made: Brief, how: "written" | "carried") => {
		chronicle.briefs[at] = made;
		if (how === "written" && options.journal) keep(options.journal, at, made);
		for (const gap of made.gaps) table.gaps.push(`Seat ${at} brief (${how}): ${gap}`);
	};

	for (const at of table.seats) {
		const decide = pick(parts.get(at.id)!, "decide");
		if (!decide?.model || decide.model.type !== "classifier") {
			throw new Error(
				`Seat ${at.id} has no decision model. ` +
					`${decide?.problem ?? `${decide?.pattern} is not a classifier.`} ` +
					`Run /magic models to read the roster, and /magic models decide <pattern> to change it.`,
			);
		}
		intents[at.id] = startingIntent(at.id);
		const strategy = pick(parts.get(at.id)!, "strategy");
		const planning = strategy && !strategy.off && strategy.model && strategy.model.type !== "classifier"
			? reasoner({ role: "strategy", stream: inference.stream, model: strategy.model as Model<Api>, tally: counted,
				...(strategy.thinkingLevel ? { thinking: strategy.thinkingLevel } : {}) }) : undefined;
		if (options.circuits && !table.work[at.id]) {
			if (!planning) throw new Error(`Seat ${at.id} needs a strategy model to begin circuits.`);
			editWork(table, at.id, [{ do: "plan.request", reason: "Prepare the opening stretch of play, with recipes and scheduled checks for threats, opportunities and maintenance. Begin at the first priority opportunity." }], `circuits-${at.id}`);
		}
		players[at.id] = aiSeat({
			name: at.name,
			api: decisionApi(inference.classify, decide.model as ClassifierModel<ClassifierApi>, { tally: counted }),
			intent: intents[at.id]!,
			chronicle,
			...(options.rules ? { rules: options.rules } : {}),
			...(options.dials === undefined ? {} : { dials: options.dials }),
			onGap: (note) => void table.gaps.push(note),
			onDial: (route) => void (dialled[route] = (dialled[route] ?? 0) + 1),
			...(planning ? { plan: (frame) => planWork(frame, { brief: chronicle.briefs[at.id], recaps: chronicle.recaps, cards: universe }, planning),
				interpret: (frame, names) => interpretCards(frame, names, { cards: universe }, planning) } : {}),
		});
	}

	// One wave for the whole table. Every question is answerable from a deck list
	// and a seat count, so none waits on another and the pass costs one round
	// trip of wall time rather than one per question.
	await Promise.all(
		table.seats.map(async (at) => {
			// The carried brief first, before the roster is consulted at all. A
			// clone owns its preparation: asking this run's roster whether to keep
			// it let `pregame: "off"`, or losing access to the model that wrote it,
			// throw away a plan the clone already held and write an empty one over
			// the top of it.
			const carried = options.prepared?.find((made) => made.seat === at.id);
			if (carried) {
				take(at.id, carried.made as Brief, "carried");
				return;
			}
			const role = pick(parts.get(at.id)!, "pregame");
			// Off is a decision somebody made, so it is not a gap.
			if (role?.off) {
				take(at.id, emptyBrief(at.id), "written");
				return;
			}
			if (!role?.model || role.model.type === "classifier") {
				take(
					at.id,
					{
						...emptyBrief(at.id),
						gaps: [`no pregame model: ${role?.problem ?? `${role?.pattern} is not a chat model`}`],
					},
					"written",
				);
				return;
			}
			const others = table.seats.filter((other) => other.id !== at.id) as Seat[];
			const written = await brief(
				at,
				others,
				universe,
				reasoner({
					role: "pregame",
					stream: inference.stream,
					model: role.model as Model<Api>,
					...(role.thinkingLevel ? { thinking: role.thinkingLevel } : {}),
					tally: counted,
				}),
				{ ...options, openLists: table.format.decksRegistered },
			);
			take(at.id, written, "written");
		}),
	);

	return {
		players,
		intents,
		chronicle,
		tally: counted,
		picks: () => counted.spent().filter((spend) => spend.role === "decide").length,
		dials: dialled,
	};
}

/**
 * Play the table out, summarising each turn that had something in it.
 *
 * The recaps run beside the game and not inside it. A recap is written for the
 * turns after it, so nothing in the game is waiting on one, and awaiting each
 * call at the turn boundary costs the whole game its speed: measured on a game
 * of basic lands, 107 recaps at a second or two each turn 24 seconds of play
 * into minutes of it. The prompt is built synchronously at the boundary, so a
 * recap describes the turn that just ended however late the answer lands.
 *
 * One consequence worth naming. Which recaps have landed when a decision is
 * built depends on timing, so two runs of the same seed can show a seat
 * different context. Replay is unaffected, because it reads the recorded
 * decisions rather than reproducing the thinking, but a benchmark comparing two
 * models should hold the recap setting fixed.
 *
 * The commentator is the table's, not a seat's, because a recap is public and
 * every seat reads the same one. Its role is read from seat 0's roster, so that
 * seat's choice is the one used: a second commentator would double the cost for
 * one shared line.
 */
export async function run(
	table: Table,
	seated: Seated,
	inference: Inference,
	commentator: Cast | undefined,
	watch?: Watcher,
	journal?: Journal,
	/** How long to wait for outstanding recaps once the game is saved. */
	grace = 30_000,
): Promise<Outcome | null> {
	const talking =
		commentator && !commentator.off && commentator.model && commentator.model.type !== "classifier"
			? reasoner({
					role: "summary",
					stream: inference.stream,
					model: commentator.model as Model<Api>,
					...(commentator.thinkingLevel ? { thinking: commentator.thinkingLevel } : {}),
					tally: seated.tally,
				})
			: undefined;

	// Kept in turn order rather than arrival order, so reading the last three is
	// reading the last three turns.
	const keep = (said: Recap) => {
		const at = seated.chronicle.recaps.findIndex((other) => other.turn > said.turn);
		seated.chronicle.recaps.splice(at < 0 ? seated.chronicle.recaps.length : at, 0, said);
	};

	const flight: Promise<void>[] = [];
	const outcome = await play(table, seated.players, seated.intents, watch, (turn, active, from) => {
		// A reasoner that has given up is one problem, not one per turn. The gap
		// it wrote on the way down says the rest of the game ran without recaps.
		if (!talking || talking.broken()) return;
		flight.push(
			recap(table, talking, {
				number: turn,
				active: table.seats.find((at) => at.id === active)?.name ?? String(active),
				from,
			})
				.then((said) => {
					if (!said) return;
					keep(said);
					watch?.(`Turn ${said.turn}: ${said.line}`);
				})
				// A missing recap costs a later decision some context. It does not
				// stop a game, and the gap says the game ran without it.
				.catch((error) => {
					const why = talking.broken();
					table.gaps.push(
						why
							? `No recaps from turn ${turn} on: ${why}`
							: `No recap for turn ${turn}: ${String(error)}`,
					);
				}),
		);
	});

	// The game is saved first and the commentary is waited on after. A recap is
	// not part of the game, so a recap that never answers must not be able to
	// lose a finished one, which is what appending after the wait allowed.
	//
	// Only what the file does not hold, because a resumed game is appended to
	// and the lines its replay rebuilt are already in it.
	if (journal) save(journal, table);

	// Bounded, so an unanswered recap delays the report rather than holding the
	// command open. What is still outstanding is said rather than waited for.
	const left = await settle(flight, grace);
	if (left) table.gaps.push(`${left} recaps were still unanswered when the game was saved.`);
	return outcome;
}

/**
 * Wait for the outstanding work, up to a point.
 *
 * Returns how many had not settled. A run that reports its own loose ends is
 * better than one that hangs on them, and better than one that drops them
 * without saying so.
 *
 * Exported for one test only. Whether this resolves when nothing else is alive
 * is a property of the process, not of the call, so stating it needs a child
 * process rather than an assertion: under a test runner there is always other
 * machinery keeping the loop awake, which is exactly how an unreferenced timer
 * here went unnoticed.
 */
export async function settle(flight: Promise<void>[], grace: number): Promise<number> {
	if (!flight.length) return 0;
	let done = 0;
	const counted = flight.map((one) => one.then(() => void (done += 1)));
	// The timer is referenced while it is awaited. Unreferencing it let Node
	// decide there was nothing left to do between a stuck recap and the timeout,
	// so the await never resolved and the process exited instead of reporting its
	// loose ends. Cleared the moment the commentary lands, so a run that answered
	// promptly does not sit out the grace.
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			Promise.all(counted),
			new Promise((resolve) => void (timer = setTimeout(resolve, grace))),
		]);
	} finally {
		clearTimeout(timer);
	}
	return flight.length - done;
}

/** What the run cost and what it did, as the lines a report prints. */
export const report = (table: Table, seated: Seated, outcome: Outcome | null, ms: number): string[] => {
	const by = (why: string) => table.ledger.filter((row) => row.why === why).length;
	const spends: readonly Spend[] = seated.tally.spent();
	const failed = spends.filter((spend) => spend.failed).length;
	return [
		`state     ${degraded(table, seated) ?? "clean"}`,
		`outcome   ${outcome ? JSON.stringify(outcome.results) : "unfinished, waiting on a usable answer"}`,
		`turns     ${table.cursor.turn}`,
		`decisions ${table.ledger.length}  forced ${by("forced")}  delegated ${by("delegated")}  chosen ${by("chosen")}  declared ${by("declared")}  fallback ${by("fallback")}`,
		`forced    ${((by("forced") / Math.max(1, table.ledger.length)) * 100).toFixed(1)}%`,
		`picks     ${seated.picks()} decision-model calls`,
		`work      ${table.workLog.filter((entry) => entry.tools).length} equipment batches  ${table.workLog.filter((entry) => entry.note.startsWith("Executed step")).length} draft steps executed`,
		`recaps    ${seated.chronicle.recaps.length} of ${table.cursor.turn} turns`,
		// A route is a request, so it is in the picks count already. Named
		// separately because "how often did a seat look a rule up" is the question
		// the dialer exists to answer and a total hides it.
		`dials     ${Object.values(seated.dials).reduce((n, count) => n + count, 0)}` +
			(Object.keys(seated.dials).length
				? `  ${Object.entries(seated.dials).map(([route, count]) => `${route} ${count}`).join(", ")}`
				: ""),
		`failed    ${failed} of ${spends.length} model calls`,
		`elapsed   ${(ms / 1000).toFixed(1)}s`,
		"",
		...bill(spends),
		...(table.gaps.length ? ["", `gaps      ${table.gaps.length}`, ...table.gaps.map((gap) => `  ${gap}`)] : []),
	];
};

/**
 * Did this run give a usable result, or did it degrade?
 *
 * The question a benchmark has to be able to ask. A game that finished with half
 * its briefs missing and no recaps is a finished game and not a comparable one,
 * so this names the reason rather than leaving a caller to read the gap list and
 * guess. Null means nothing was lost.
 */
export function degraded(table: Table, seated: Seated): string | null {
	const spends = seated.tally.spent();
	const failed = spends.filter((spend) => spend.failed).length;
	if (table.ledger.some((row) => row.why === "fallback")) return "a decision was taken by fallback";
	if (failed && failed === spends.length) return "every reasoning call failed";
	if (failed > spends.length / 4) return `${failed} of ${spends.length} reasoning calls failed`;
	if (spends.some((spend) => spend.truncated)) return "a reply hit its output ceiling";
	if (table.gaps.length) return `${table.gaps.length} gaps`;
	return null;
}
