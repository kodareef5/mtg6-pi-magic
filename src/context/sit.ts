/**
 * Seating a whole table of model-backed seats.
 *
 * One place that turns a resolved roster into a playable table, so `/magic play`
 * and `tools/smoke.ts` do not each assemble it differently and then disagree
 * about what a game costs.
 *
 * The order is the cost order. The pregame runs once, concurrently across every
 * seat and every question. The decision model runs per asked decision. The
 * commentator runs once per turn that had anything in it. Nothing else runs
 * yet: `strategy.planPhase` and `ruling.rule` are written as pipelines and have
 * no caller until the pieces under them exist.
 */

import type { Api, ClassifierApi, ClassifierModel, Model } from "@earendil-works/pi-ai";

import type { Universe } from "../core/cards.ts";
import type { Intent } from "../core/intent.ts";
import { play, type Watcher } from "../core/loop.ts";
import type { Player } from "../core/player.ts";
import type { Seat, Table } from "../core/table.ts";
import type { Outcome, SeatId } from "../core/types.ts";
import { brief, emptyBrief } from "./brief.ts";
import { decisionApi, type Classify } from "./model.ts";
import type { Chronicle } from "./packet.ts";
import { startingIntent } from "./plan.ts";
import { reasoner, type Stream } from "./reason.ts";
import type { Cast, Role } from "./roles.ts";
import { bill, tally, type Spend, type Tally } from "./spend.ts";
import { aiSeat } from "./seat.ts";
import { recap, type Recap } from "./summary.ts";

/** What Pi gives us, narrowed to the two calls a game makes. */
export type Inference = { classify: Classify; stream: Stream };

export type Seated = {
	players: Record<SeatId, Player>;
	intents: Record<SeatId, Intent>;
	chronicle: Chronicle;
	tally: Tally;
	/** Decision-model calls. Counted here because the classifier is not metered by Pi. */
	picks: () => number;
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
	options: { format: string; openLists?: boolean } ,
): Promise<Seated> {
	const counted = tally();
	const chronicle: Chronicle = { briefs: {}, recaps: [] };
	const players: Record<SeatId, Player> = {};
	const intents: Record<SeatId, Intent> = {};
	let picks = 0;

	const parts = new Map<SeatId, Cast[]>();
	for (const at of table.seats) parts.set(at.id, await rosters(at.id));

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
		players[at.id] = aiSeat({
			name: at.name,
			api: decisionApi(inference.classify, decide.model as ClassifierModel<ClassifierApi>),
			intent: intents[at.id]!,
			chronicle,
			onGap: (note) => void table.gaps.push(note),
			onAsk: () => void (picks += 1),
		});
	}

	// One wave for the whole table. Every question is answerable from a deck list
	// and a seat count, so none waits on another and the pass costs one round
	// trip of wall time rather than one per question.
	await Promise.all(
		table.seats.map(async (at) => {
			const role = pick(parts.get(at.id)!, "pregame");
			// Off is a decision somebody made, so it is not a gap.
			if (role?.off) {
				chronicle.briefs[at.id] = emptyBrief(at.id);
				return;
			}
			if (!role?.model || role.model.type === "classifier") {
				chronicle.briefs[at.id] = {
					...emptyBrief(at.id),
					gaps: [`No pregame model: ${role?.problem ?? `${role?.pattern} is not a chat model`}`],
				};
				table.gaps.push(`Seat ${at.id} played with no brief. ${role?.problem ?? ""}`.trim());
				return;
			}
			const others = table.seats.filter((other) => other.id !== at.id) as Seat[];
			chronicle.briefs[at.id] = await brief(
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
				options,
			);
			for (const gap of chronicle.briefs[at.id]!.gaps) table.gaps.push(`Seat ${at.id} brief: ${gap}`);
		}),
	);

	return { players, intents, chronicle, tally: counted, picks: () => picks };
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
		if (!talking) return;
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
				.catch((error) => void table.gaps.push(`No recap for turn ${turn}: ${String(error)}`)),
		);
	});

	// Settled before the report, so the bill counts every call and no request
	// outlives the game that made it.
	await Promise.all(flight);
	return outcome;
}

/** What the run cost and what it did, as the lines a report prints. */
export const report = (table: Table, seated: Seated, outcome: Outcome | null, ms: number): string[] => {
	const by = (why: string) => table.ledger.filter((row) => row.why === why).length;
	const spends: readonly Spend[] = seated.tally.spent();
	return [
		`outcome   ${outcome ? JSON.stringify(outcome.results) : "unfinished, waiting on a usable answer"}`,
		`turns     ${table.cursor.turn}`,
		`decisions ${table.ledger.length}  forced ${by("forced")}  chosen ${by("chosen")}  fallback ${by("fallback")}`,
		`forced    ${((by("forced") / Math.max(1, table.ledger.length)) * 100).toFixed(1)}%`,
		`picks     ${seated.picks()} decision-model calls`,
		`recaps    ${seated.chronicle.recaps.length} of ${table.cursor.turn} turns`,
		`elapsed   ${(ms / 1000).toFixed(1)}s`,
		"",
		...bill(spends),
		...(table.gaps.length ? ["", `gaps      ${table.gaps.length}`, ...table.gaps.map((gap) => `  ${gap}`)] : []),
	];
};
