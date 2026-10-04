/**
 * A classifier seat answers listed choices, follows rule routes, and prepares
 * or executes private equipment. Strategy supplies recipes on request; focus
 * builds the decision packet without inference.
 *
 * Prepared procedures support declarations and delegated continuations. Raw
 * declarations, free-form delegation, and objections still lack game handlers.
 * Past 150 lines to keep the question beside its navigation and answer handling.
 */

import type { Answer, Player } from "../core/player.ts";
import type { Rules } from "../core/rules.ts";
import type { Frame } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { follow } from "./dial.ts";
import { asState, chose, type DecisionApi, type Question } from "./model.ts";
import { focus, type Chronicle, type Packet } from "./packet.ts";
import { answerReview } from "./review.ts";
import type { WorkCommand } from "../core/work-language.ts";
import { pendingReviews } from "../core/agenda.ts";
import { workMenu } from "../core/work-menu.ts";

export type AiSeatOptions = {
	name: string;
	api: DecisionApi;
	/** This seat's plan. Held by the core, filled by whoever holds the seat. */
	intent: Intent;
	/**
	 * The brief and the recaps, by reference so the recaps stay current. Absent
	 * is a seat playing with no plan, which still plays.
	 */
	chronicle?: Chronicle;
	/**
	 * The rules, so the seat can answer its own route. Absent is a seat with no
	 * dialer, which still plays: `dial` offers nothing it cannot answer.
	 */
	rules?: Rules;
	/**
	 * How many routes this seat may follow before it has to answer with a move.
	 * Each one is a real request, so this is a budget and not a safeguard.
	 */
	dials?: number;
	/** Recorded on the table when an answer comes back unusable. */
	onGap(note: string): void;
	/** Called with the route id each time this seat follows one. For the report. */
	onDial?(route: string): void;
	/**
	 * Called once per request, before it is made.
	 *
	 * Before, not after. A request that failed is a request that was made, and
	 * counting on the way back reported an attempted call as no call at all.
	 */
	onAsk?(packet: Packet): void;
	/** Called only when private equipment explicitly requests fresh thought. */
	plan?(frame: Frame): Promise<WorkCommand[]>;
};

/** One question per decision, so the key is fixed and the answer is unambiguous. */
const KEY = "pick";

/**
 * The packet as a choice question.
 *
 * Equal detail per option. A brilliant line described richly beside a waste of
 * resources described in three words manufactures a preference without any
 * analysis, so every criterion is built the same way from the same fields.
 *
 * The instructions say what is true and what has to be settled. They do not say
 * what is good: advice here would make every seat play the same way and would
 * hide the alternatives the packet just spent its space listing.
 */
export function question(packet: Packet): Question {
	const lines = [
		packet.obligation,
		"",
		...packet.known,
		...(packet.resources.length ? ["", ...packet.resources] : []),
		...(packet.lately.length ? ["", "Recently:", ...packet.lately] : []),
		// The plan, then the priorities it serves, then what is only assumed.
		// Guidance before priorities because a snippet written for this window
		// is more specific than a deck-level ordering, and more specific wins.
		...(packet.guidance.length ? ["", "The plan for this seat here:", ...packet.guidance] : []),
		...(packet.priorities.length ? ["", "This seat's priorities, in order:", ...packet.priorities] : []),
		...(packet.assumed.length ? ["", "Assumed, not known:", ...packet.assumed] : []),
		// What the seat asked for, before the refusal, because a rule it pulled up
		// is a fact about this decision and a refusal is a fact about its answer.
		...(packet.learned?.length ? ["", "Rules you asked for:", ...packet.learned] : []),
		...(packet.refused?.length ? ["", "An earlier answer was not taken:", ...packet.refused] : []),
		...(packet.work ? ["", `Equipment revision ${packet.work.revision}.`,
			...packet.committed.map((step) => `Already executed: ${step}`),
			...(packet.work.draft ? [`Draft: ${packet.work.draft.label}; step ${packet.work.draft.next + 1}; ${packet.work.draft.status}.`,
				...packet.work.draft.reserves.map((reserve) => `Reserve ${reserve.object.id}@${reserve.object.incarnation}: ${reserve.purpose}`)] : []),
			"Work ids edit or execute the named draft. An edit moves no cards; ready does not mean executed.",
			"Ordinary listed plays remain available. Due reviews and drafts need a disposition before passing."] : []),
		"",
		"Answer with one listed id. These ids include the moves and routes available in this request.",
		"Prepared procedures check resources against stated costs; they do not certify card meaning or rules legality.",
		"Guidance may have been revised for this position. It remains a plan, not a guarantee that its assumptions hold.",
		...(packet.routes.length
			? [
					"",
					"Some ids are asks rather than moves. An ask plays nothing, changes nothing,",
					"and brings this same decision back with what you asked for in front of you.",
					"What an ask does not promise: it shows the rules it names and no others, so",
					"the rule that decides this may not be among them.",
				]
			: []),
	];
	return {
		type: "choice",
		instructions: lines.join("\n"),
		criteria: Object.fromEntries([
			...(packet.workOptions ?? []).map((option) => [option.id, [option.label, option.shows].filter(Boolean).join(". ")]),
			...packet.options.map((option) => [
				option.id,
				[option.label, option.shows, option.consequence].filter(Boolean).join(". "),
			]),
			// Built the same way as a move, so a route is not described more richly
			// than the moves it sits beside. It says it acts on nothing, because an
			// id that reads like a move is one a seat will play.
			...packet.routes.map((route) => [
				route.id,
				`Ask to see ${route.does}. Acts on nothing and returns to this decision.`,
			]),
		]),
	};
}

export function aiSeat(options: AiSeatOptions): Player {
	let latest: Frame | undefined;
	let asked = 0;
	let navigation: { version: number; learned: string[]; walked: string[] } | undefined;

	return {
		name: options.name,

		/**
		 * Walk the dialer, then answer with a move.
		 *
		 * The loop is here and not in `src/core/loop.ts` on purpose. Following a
		 * route moves nothing, so the game must not advance while it happens: the
		 * table does not know this seat looked a rule up, and the decision it is
		 * waiting on is the same decision either way. The core's `ask` answer kind
		 * stays unimplemented because a seat that can answer its own route never
		 * needs to send one.
		 *
		 * It terminates by construction. Past the budget the rules are not passed
		 * to `focus`, so `dial` offers nothing, so no answer can be a route.
		 */
		async answer(frame) {
			if (!frame.decision) throw new Error(`${options.name} was asked a frame with no decision`);
			latest = frame;

			// Preparation changes only on a recorded request. A phase change
			// alone is not a reason for a model call.
			const seated = options.chronicle;
			const budget = options.dials ?? 2;
			if (navigation?.version !== frame.version) navigation = { version: frame.version, learned: [], walked: [] };
			const { learned, walked } = navigation;
			if (frame.view.work?.request && frame.decision.situation === "priority") {
				if (!options.plan) throw new Error(`Strategy requested, but no planner is available: ${frame.view.work.request}`);
				return { kind: "work", tools: await options.plan(frame), revision: frame.view.work.revision, actionId: `${options.name}-${frame.version}-${frame.view.work.revision}-plan-${++asked}` };
			}

			for (;;) {
				const whole = focus(frame, options.intent, {
					...(seated?.briefs[frame.seat] ? { brief: seated.briefs[frame.seat] } : {}),
					...(seated ? { recaps: seated.recaps } : {}),
					...(options.rules && walked.length < budget ? { rules: options.rules } : {}),
					...(learned.length ? { learned } : {}),
				});
				// A route already followed is not offered again. Its answer is
				// already in front of the seat, and offering it twice spends the
				// budget on something the seat has read.
				const packet = { ...whole, routes: whole.routes.filter((route) => !walked.includes(route.id)) };
				const due = pendingReviews(frame)[0];
				if (due) {
					if (due.items.length) { asked += 1; options.onAsk?.(packet); }
					return answerReview(options.api, packet, due, frame, `${options.name}-${frame.version}-${frame.view.work!.revision}-review-${asked}`);
				}

				asked += 1;
				options.onAsk?.(packet);
				const answers = await options.api.ask({
					state: asState(packet),
					questions: { [KEY]: question(packet) },
				});

				const answer = chose(answers, KEY);
				if (typeof answer === "string") {
					// Returned to the loop unchanged. It owns the retry and the
					// fallback accounting, and replacing this with the first option
					// would lose the difference between a choice and a fallback.
					options.onGap(`${options.name} via ${options.api.named}: ${answer}`);
					return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
				}

				const route = packet.routes.find((candidate) => candidate.id === answer.choice);
				if (!route) {
					const work = workMenu(frame).find((option) => option.id === answer.choice);
					const actionId = `${options.name}-${frame.version}-${frame.view.work?.revision ?? 0}-${asked}`;
					if (work?.tools) return { kind: "work", tools: work.tools, revision: frame.view.work!.revision, actionId };
					if (work?.execute) return { kind: "execute", draft: work.execute, revision: frame.view.work!.revision, actionId };
					return { kind: "pick", option: answer.choice, actionId: `${options.name}-${asked}` } satisfies Answer;
				}
				walked.push(route.id);
				learned.push(...follow(route, options.rules!));
				options.onDial?.(route.id);
			}
		},

		// Watching is free and reacting is not, so nothing is asked here. The
		// frame is kept because the next intent check reads what changed.
		observe(frame) {
			latest = frame;
		},

		close() {
			latest = undefined;
			void latest;
		},
	};
}
