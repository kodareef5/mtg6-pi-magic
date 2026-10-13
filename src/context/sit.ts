/**
 * Seating a whole table of model-backed seats.
 *
 * One place that turns a resolved roster into a playable table, so a hosted game
 * and `tools/smoke.ts` do not each assemble it differently and then disagree
 * about what a game costs.
 *
 * The order is the cost order. The pregame runs once, concurrently across every
 * seat and every question. The decision model runs per asked decision. The
 * commentator runs once per turn that had anything in it. A seat with a
 * strategist prepares during the opponent's turn and accepts or amends after
 * the draw, and when its plan stops fitting. The judge can rewind an action.
 * Past 150 lines to keep preparation, restoration and shutdown under the same
 * lifecycle. This file owns no prompts or card syntax.
 */

import type { Api, ClassifierApi, ClassifierModel, Model } from "@earendil-works/pi-ai";

import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import { keep, save, type Journal } from "../core/journal.ts";
import type { Intent } from "../core/intent.ts";
import { play, type Judge, type PlayOptions, type Watcher } from "../core/loop.ts";
import { start } from "../core/commit.ts";
import { TableHalted, type Player } from "../core/player.ts";
import type { Seat, Table } from "../core/table.ts";
import type { Workspace } from "../core/work.ts";
import type { WorkCommand } from "../core/work-language.ts";
import type { Frame, Outcome, SeatId } from "../core/types.ts";
import { brief, current, emptyBrief, type Brief } from "./brief.ts";
import { guideFor } from "./guides.ts";
import { loadStored, saveAssessed } from "../core/packages.ts";
import { decisionApi, type Classify } from "./model.ts";
import type { Chronicle } from "./packet.ts";
import { startingIntent } from "./plan.ts";
import { reasoner, type Reasoner, type Stream } from "./reason.ts";
import { rule } from "./ruling.ts";
import type { Cast, Role } from "./roles.ts";
import { bill, tally, type Tally } from "./spend.ts";
import { aiSeat, type Planned, type Prepared } from "./seat.ts";

/** What a brief reads of a seat: who, and the registered list. A guest has these from the public lists alone. */
type BriefSeat = Pick<Seat, "id" | "name" | "deck">;
import { recap, type Recap } from "./summary.ts";
import { planWork, prepareTurn } from "./strategy.ts";
import { editWork } from "../core/work-tools.ts";
import { assessCard } from "./assess.ts";
import { interpret } from "./interpret.ts";
import type { RunTiming } from "./spend.ts";
import type { BriefCache } from "./brief-cache.ts";

/** What Pi gives us, narrowed to the two calls a game makes. */
export type Inference = { classify: Classify; stream: Stream };

export type Seated = {
	/** This invocation, including preparation. Carried decisions belong to the game prefix. */
	timing: RunTiming;
	fromVersion: number;
	judged: { cases: number; failed: number };
	players: Record<SeatId, Player>;
	intents: Record<SeatId, Intent>;
	chronicle: Chronicle;
	briefs?: { seat: SeatId; from: "written" | "cached" | "carried" }[];
	tally: Tally;
	/** Requests to the decision model, attempts included. Read from the bill. */
	picks: () => number;
	/** Routes followed, by route id. Beside the bill, because a dial is a request. */
	dials: Record<string, number>;
	/** Each time a seat waited on strategy for its plan, and how the plan came. */
	planned: Planned[];
	/** The table's judge, when a judge role resolved and the rules are on disk to cite. */
	judge?: { reasoner: Reasoner; rules: Rules; universe: Universe };
};

const pick = (parts: Cast[], role: Role) => parts.find((part) => part.role === role);

/**
 * Give every seat a model to answer with, and run the pregame.
 *
 * It refuses rather than starting half ready. A seat whose `decide` role did not
 * resolve has nothing to answer it, and a game that starts anyway spends its
 * first decision finding that out.
 *
 * Cards with rules text need accepted assessments before play. A carried
 * assessment needs no model. A missing brief alone still costs quality rather
 * than refusing the game.
 */
export async function seat(
	table: Table,
	rosters: (seat: SeatId) => Promise<Cast[]>,
	inference: Inference,
	universe: Universe,
	options: {
		format: string;
		/** Reuse and save source-checked packages for a new game only. */
		reusePackages?: boolean;
		/** New games that reuse preparation also cache matchup briefs. False opts out. */
		briefCache?: false | Omit<BriefCache, "identity">;
		/** Cache failures are notices; accepted equipment stays in this game's journal. */
		packageNotice?: (message: string) => void;
		/**
		 * The rules, so a seat can look one up mid decision. Absent is a table
		 * with no dialer, which still plays.
		 */
		rules?: Rules;
		/** How many routes a seat may follow per decision. */
		dials?: number;
		/** Written to as the game runs, so a clone of this game is a prefix of it. */
		journal?: Journal;
		/**
		 * Briefs a clone carried. A seat whose brief is here is not asked for one
		 * again, which is the whole point of cloning at version zero. They are
		 * used as given: a clone is the same game continued, so there is nothing
		 * to check them against.
		 */
		prepared?: { seat: SeatId; made: unknown }[];
		/** A seat's own calls, such as one made with that seat's key. The table's judge uses `inference`. */
		seatInference?: (seat: SeatId) => Inference;
		/** Seats answered from elsewhere, by seat: their player, models and brief are theirs, not this table's. */
		remote?: Record<SeatId, Player>;
	},
): Promise<Seated> {
	const of = (at: SeatId) => options.seatInference?.(at) ?? inference;
	const timing: RunTiming = { startedAt: Date.now(), turns: [] };
	const fromVersion = table.ledger.length;
	const counted = tally();
	const dialled: Record<string, number> = {};
	const planned: Planned[] = [];
	const chronicle: Chronicle = { briefs: {}, recaps: [] };
	const briefs: NonNullable<Seated["briefs"]> = [];
	const players: Record<SeatId, Player> = {};
	const intents: Record<SeatId, Intent> = {};

	const parts = new Map<SeatId, Cast[]>();
	for (const at of table.seats) parts.set(at.id, options.remote?.[at.id] ? [] : await rosters(at.id));
	const judging = table.seats.map((at) => pick(parts.get(at.id)!, "judge")).find((part) => part && !part.off && part.model && part.model.type !== "classifier");

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
		briefs.push({ seat: at, from: how === "carried" ? how : made.cache?.reused ? "cached" : "written" });
		if (how === "written" && options.journal) keep(options.journal, at, made);
		for (const gap of made.gaps) table.gaps.push(`Seat ${at} brief (${how}): ${gap}`);
	};

	for (const at of table.seats) {
		intents[at.id] = startingIntent(at.id);
		// A seat answered from elsewhere brings its own player and models; the table only plays against it.
		const remote = options.remote?.[at.id];
		if (remote) { players[at.id] = remote; continue; }
		const made = aiPlayer(at, parts.get(at.id)!, of(at.id), universe, { chronicle, tally: counted, judge: !!judging && !!options.rules, intent: intents[at.id]!,
			...(options.rules ? { rules: options.rules } : {}), ...(options.dials === undefined ? {} : { dials: options.dials }),
			onGap: (note) => void table.gaps.push(note), onDial: (route) => void (dialled[route] = (dialled[route] ?? 0) + 1), onPlanned: (one) => void planned.push(one) });
		const setup = made.planning ? setupWork(table.work[at.id], table.ledger.length) : [];
		if (setup.length) editWork(table, at.id, setup, `planning-${at.id}`);
		players[at.id] = made.player;
	}

	// Card meaning precedes play. Every seat needs the registered universe,
	// including cards it may gain control of. Accepted work survives a retry or
	// a version-zero clone; a resumed position must already carry its assessment.
	const reuse = options.reusePackages && !table.ledger.length && !options.prepared?.length;
	if (reuse) loadStored(table, universe, (seat) => {
		// A remote seat interprets its deferred uses with its own strategy model.
		if (options.remote?.[seat]) return false;
		const strategy = pick(parts.get(seat)!, "strategy");
		return !strategy?.model || !!strategy.off || strategy.model.type === "classifier";
	}, options.packageNotice ? { notice: options.packageNotice } : {});
	const jobs = table.seats.flatMap((at) => Object.entries(table.printed).filter(([card, printed]) => printed.text &&
		!table.work[at.id]?.packages?.some((pack) => pack.card === card && pack.assessed)).map(([card, printed]) => ({ seat: at.id, card, printed })));
	const refuse = async (message: string): Promise<never> => {
		if (options.journal) save(options.journal, table);
		await Promise.all(Object.values(players).map((player) => player.close()));
		throw Object.assign(new Error([message, ...bill(counted.spent())].join("\n")), { spends: counted.spent(), timing: { ...timing, finishedAt: Date.now() }, problem: message });
	};
	if (jobs.length && table.ledger.length) return refuse("This position lacks standing card assessments and use inventories. Replay remains available; start from prepared version zero to play.");
	const assessors = new Map<SeatId, Reasoner>();
	for (const seat of new Set(jobs.map((job) => job.seat))) {
		if (options.remote?.[seat]) return refuse(`Seat ${seat} is answered from elsewhere, and its deck has cards without stored assessments. Seat a deck the store covers.`);
		const role = pick(parts.get(seat)!, "pregame");
		if (!role?.model || role.off || role.model.type === "classifier") return refuse(`Seat ${seat} needs a pregame model to assess its cards before play, or a clone carrying standing assessments and use inventories.`);
		assessors.set(seat, reasoner({ role: "pregame", seat, stream: of(seat).stream, model: role.model as Model<Api>, tally: counted,
			...(role.thinkingLevel ? { thinking: role.thinkingLevel } : {}) }));
	}
	let next = 0;
	const failed: string[] = [];
	await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
		for (let job = jobs[next++]; job; job = jobs[next++]) {
			try {
				const strategy = pick(parts.get(job.seat)!, "strategy");
				const scope = strategy?.model && !strategy.off && strategy.model.type !== "classifier" ? "standing" : "complete";
				const pack = await assessCard(job.card, job.printed, assessors.get(job.seat)!, universe, options.rules, scope);
				editWork(table, job.seat, [{ do: "package.put", package: pack }], `assess-${job.seat}-${job.card}`);
			} catch (error) { failed.push(`Seat ${job.seat}: ${String(error)}`); }
		}
	}));
	if (reuse) saveAssessed(table, universe, (seat) => pick(parts.get(seat)!, "pregame")?.pattern, options.packageNotice ? { notice: options.packageNotice } : {});
	if (failed.length) return refuse(`Card assessment is incomplete; play has not started. ${failed.join("\n")}`);
	for (const at of table.seats) {
		const strategy = pick(parts.get(at.id)!, "strategy");
		if (!options.remote?.[at.id] && table.work[at.id]?.packages?.some((pack) => pack.deferred?.length) && (!strategy?.model || strategy.off || strategy.model.type === "classifier"))
			return refuse(`Seat ${at.id} carries deferred card uses but has no strategy model to interpret them. Use a roster with an interpreter or a clone with those uses prepared.`);
	}
	if (options.journal) save(options.journal, table);

	// Every seat prepares at once: its analysts together, then its synthesis.
	await Promise.all(
		table.seats.map(async (at) => {
			// The carried brief first, before the roster is consulted at all. A
			// clone owns its preparation: asking this run's roster whether to keep
			// it let `pregame: "off"`, or losing access to the model that wrote it,
			// throw away a plan the clone already held and write an empty one over
			// the top of it.
			const carried = options.prepared?.find((made) => made.seat === at.id);
			if (carried) {
				take(at.id, current(carried.made, at.id), "carried");
				return;
			}
			// A remote seat's brief is its own, written where its models are.
			if (options.remote?.[at.id]) return;
			const others = table.seats.filter((other) => other.id !== at.id);
			take(at.id, await seatBrief(at, others, parts.get(at.id)!, universe, of(at.id), counted, {
				format: options.format, ...(options.rules ? { rules: options.rules } : {}),
				// A guest's roster is its own and unknown here: the brief is keyed on the rosters this table knows.
				...(reuse && options.briefCache !== false ? { cache: options.briefCache ?? {}, rosters: [at, ...others].filter((one) => !options.remote?.[one.id]).map((one) => parts.get(one.id)!) } : {}),
			}), "written");
		}),
	);

	// The judge is the table's: the first seat's roster that names a chat model for it.

	timing.preparedAt = Date.now();
	return {
		timing, fromVersion, judged: { cases: 0, failed: 0 },
		players,
		intents,
		chronicle, briefs,
		tally: counted,
		picks: () => counted.spent().filter((spend) => spend.role === "decide").length,
		dials: dialled,
		planned,
		...(judging && options.rules ? { judge: { reasoner: reasoner({ role: "judge", stream: inference.stream, model: judging.model as Model<Api>, tally: counted,
			...(judging.thinkingLevel ? { thinking: judging.thinkingLevel } : {}) }), rules: options.rules, universe } } : {}),
	};
}

/**
 * One model seat's player, from its roster: Jev answers every listed decision,
 * and the strategy model, when the seat has one, writes its plans and
 * interprets its deferred card uses. It reads frames, never the table, so it
 * answers the same way in the host's Pi or at the far end of a wire.
 */
export function aiPlayer(at: { id: SeatId; name: string }, parts: Cast[], inference: Inference, universe: Universe, shared: {
	chronicle: Chronicle; tally: Tally; intent: Intent; judge: boolean; rules?: Rules; dials?: number;
	onGap(note: string): void; onDial(route: string): void; onPlanned(one: Planned): void;
}): { player: Player; planning: boolean } {
	const decide = pick(parts, "decide");
	if (!decide?.model || decide.model.type !== "classifier") {
		throw new Error(
			`Seat ${at.id} has no decision model. ` +
				`${decide?.problem ?? `${decide?.pattern} is not a classifier.`} ` +
				`Run /magic models to read the roster, and /magic models decide <pattern> to change it.`,
		);
	}
	const strategy = pick(parts, "strategy");
	const planning = strategy && !strategy.off && strategy.model && strategy.model.type !== "classifier"
		? reasoner({ role: "strategy", seat: at.id, stream: inference.stream, model: strategy.model as Model<Api>, tally: shared.tally,
			...(strategy.thinkingLevel ? { thinking: strategy.thinkingLevel } : {}) }) : undefined;
	// What every writer session reads beside the position: the brief, the recaps, and the cards and rules to look up.
	const context = () => ({ brief: shared.chronicle.briefs[at.id], recaps: shared.chronicle.recaps, cards: universe, ...(shared.rules ? { rules: shared.rules } : {}) });
	const player = aiSeat({
		name: at.name, judge: shared.judge,
		api: decisionApi(inference.classify, decide.model as ClassifierModel<ClassifierApi>, { tally: shared.tally, seat: at.id }),
		intent: shared.intent, chronicle: shared.chronicle,
		...(shared.rules ? { rules: shared.rules } : {}), ...(shared.dials === undefined ? {} : { dials: shared.dials }),
		onGap: shared.onGap, onDial: shared.onDial, onPlanned: shared.onPlanned,
		...(planning ? {
			interpret: (frame: Frame) => interpret(frame, planning, universe, shared.rules),
			plan: (frame: Frame, prepared?: Prepared, changed?: string[]) => planWork(frame, context(), planning, prepared, changed),
			prepare: (frame: Frame, signal?: AbortSignal) => prepareTurn(frame, context(), planning, signal),
		} : {}),
	});
	return { player, planning: !!planning };
}

/**
 * The equipment edits a planning seat needs before play: strategy is due each
 * turn, since the brief handles the opening and upkeep. Older version-zero
 * clones carried an automatic opening request; it is retired without
 * discarding their brief, packages or human requests.
 */
export function setupWork(work: Workspace | undefined, version: number): WorkCommand[] {
	return [
		...(!work?.eachTurn ? [{ do: "plan.each-turn" as const }] : []),
		...(version === 0 && work?.accepted === undefined && work?.request === "Plan the opening: your first turn and the opponent's first turn."
			? [{ do: "plan.keep" as const, reason: "The brief covers the opening; strategy follows the draw." }] : []),
	];
}

/**
 * One seat's pregame brief, from the public registered lists. Off is a
 * decision somebody made, so it is not a gap; a missing model is. With a cache,
 * a complete matchup brief for the same lists, pins and rosters is reused.
 */
export async function seatBrief(at: BriefSeat, others: BriefSeat[], parts: Cast[], universe: Universe, inference: Inference, tally: Tally,
	options: { format: string; rules?: Rules; cache?: Omit<BriefCache, "identity">; rosters?: Cast[][] }): Promise<Brief> {
	const role = pick(parts, "pregame");
	if (role?.off) return emptyBrief(at.id);
	if (!role?.model || role.model.type === "classifier")
		return { ...emptyBrief(at.id), gaps: [`no pregame model: ${role?.problem ?? `${role?.pattern} is not a chat model`}`] };
	const cache = options.cache && { ...options.cache, identity: {
		format: options.format, rosters: (options.rosters ?? [parts]).map((one) => one.map((part) => ({
			role: part.role, pattern: part.pattern, off: part.off, problem: part.problem,
			model: part.model && { id: part.model.id, provider: part.model.provider, api: part.model.api }, thinking: part.thinkingLevel,
		})).sort((a, b) => a.role.localeCompare(b.role))),
	} };
	// A reasoner per call, so one analyst's failures cannot stop its siblings or the synthesis.
	return brief(at, others, universe, () => reasoner({
		role: "pregame", seat: at.id, stream: inference.stream, model: role.model as Model<Api>,
		...(role.thinkingLevel ? { thinking: role.thinkingLevel } : {}), tally,
	}), { format: options.format, guides: guideFor, ...(cache ? { cache } : {}), ...(options.rules ? { rules: options.rules } : {}) });
}

/**
 * The table's judge for `play`, when one was seated. A rollback rebuilds from a
 * fresh table for the same seats, decks and seed, after saving what the game
 * has recorded so far.
 */
export function judgeFor(table: Table, seated: Seated, journal?: Journal): Judge | undefined {
	const judging = seated.judge;
	if (!judging) return undefined;
	return { rule: async (now, open) => {
		seated.judged.cases++;
		try { return await rule(now, open, judging.reasoner, judging); }
		catch (error) { seated.judged.failed++; throw error; }
	}, restart: restartOf(table, judging.universe), flush: () => { if (journal) save(journal, table); } };
}

/** A fresh table for the same seats, decks, seed and journal boundaries: where a rollback rebuilds from. */
export function restartOf(table: Table, universe: Universe): () => Table {
	const entrants = table.seats.map((at) => ({ name: at.name, deck: at.deck }));
	return () => start(table.format, entrants, table.rng.seed, universe, { announcementsFrom: table.announcementsFrom, excessManaFrom: table.excessManaFrom, searchesFrom: table.searchesFrom, deathtouchFrom: table.deathtouchFrom, discardsFrom: table.discardsFrom });
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
	/** Told as each turn ends, for a picture of the board. Never awaited. */
	turnEnded?: (turn: number) => void,
	/**
	 * The host's hold, when a host runs the game: its checkpoint stops the loop,
	 * and `halted` applies the host's direction to the stopped table. True plays
	 * on, with every seat's private work reset; false ends the run.
	 */
	host?: { checkpoint(): void; halted(table: Table): boolean },
): Promise<Outcome | null> {
	seated.timing.playStartedAt = Date.now();
	delete seated.timing.finishedAt;
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

	const judge = judgeFor(table, seated, journal);
	const flight: Promise<void>[] = [];
	let outcome: Outcome | null;
	const options: PlayOptions = { watch, ...(host ? { checkpoint: host.checkpoint } : {}), onTurn: (turn, active, from) => {
		turnEnded?.(turn);
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
	}, judge, onTurnStart: (turn, active) => seated.timing.turns!.push({ at: Date.now(), turn, active, source: "recorded" }) };
	// The game is saved first and the commentary is waited on after. A recap is
	// not part of the game, so a recap that never answers must not be able to
	// lose a finished one, which is what appending after the wait allowed. A run
	// that throws is saved too. Only what the file does not hold is written,
	// because a resumed game is appended to and the lines its replay rebuilt are
	// already in it.
	try {
		for (;;) {
			try { outcome = await play(table, seated.players, seated.intents, options); break; }
			catch (error) {
				if (!host || !(error instanceof TableHalted)) throw error;
				if (journal) save(journal, table);
				if (!host.halted(table)) { outcome = table.outcome; break; }
				if (journal) save(journal, table);
				for (const player of Object.values(seated.players)) player.reset?.();
			}
		}
	}
	finally {
		seated.timing.playEndedAt = Date.now();
		await Promise.all(Object.values(seated.players).map((player) => player.close()));
		seated.timing.finishedAt = Date.now();
		if (journal) save(journal, table);
	}

	// Bounded, so an unanswered recap delays the report rather than holding the
	// command open. What is still outstanding is said rather than waited for.
	const left = await settle(flight, grace);
	if (left) table.gaps.push(`${left} recaps were still unanswered when the game was saved.`);
	seated.timing.finishedAt = Date.now();
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
