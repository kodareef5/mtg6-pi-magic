/**
 * A classifier seat flies its plan: it takes the step that is due, takes a
 * branch when its situation comes, follows rule routes, and asks for a new plan
 * when the one it has no longer fits. Strategy writes the plan; focus builds
 * the decision packet without inference.
 *
 * Raw declarations, free-form delegation, and objections still lack game handlers.
 * Past 150 lines to keep the question beside its navigation and answer handling.
 */

import type { Answer, Objection, Player } from "../core/player.ts";
import type { Rules } from "../core/rules.ts";
import type { Frame } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { follow } from "./dial.ts";
import { asState, chose, type DecisionApi, type Question } from "./model.ts";
import { focus, type Chronicle, type Packet } from "./packet.ts";
import type { WorkCommand } from "../core/work-language.ts";
import { planReason } from "../core/planning.ts";

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
	/** Writes this seat's plan when one is wanted. Without it, the seat cannot ask for help. */
	plan?(frame: Frame): Promise<{ tools: WorkCommand[]; objection?: Objection }>;
};

/** One question per decision, so the key is fixed and the answer is unambiguous. */
const KEY = "pick";
/** The pilot's way to say the plan no longer fits. */
export const HELP = "ask:help";

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
export function question(packet: Packet, help: boolean): Question {
	const plan = packet.plan;
	const lines = [
		packet.obligation,
		"",
		...packet.known,
		...(packet.resources.length ? ["", ...packet.resources] : []),
		...(packet.lately.length ? ["", "Recently:", ...packet.lately] : []),
		...(plan ? ["", `Your plan: ${plan.objective}`, plan.guidance,
			...(plan.done.length ? [`Done: ${plan.done.join("; ")}.`] : []),
			plan.due ? `Due now: ${plan.due}.` : "No step is due now.",
			...(plan.next.length ? [`Later: ${plan.next.join("; ")}.`] : []),
			...(plan.branches.length ? [`Branches that apply now: ${plan.branches.join("; ")}.`] : []),
			...plan.held.map((hold) => `Held: ${hold}.`),
			...(plan.stops.length ? [`The plan said to stop if: ${plan.stops.join("; ")}.`] : [])] : []),
		...(packet.guidance.length ? ["", "Notes for this window:", ...packet.guidance] : []),
		...(packet.learned?.length ? ["", "Rules you asked for:", ...packet.learned] : []),
		...(packet.refused?.length ? ["", "An earlier answer was not taken:", ...packet.refused] : []),
		"",
		"Answer with one listed id.",
		...(plan ? [
			"Take the option marked as the due plan step. Take an option marked as a plan branch when its situation is in front of you.",
			"An option that uses a held resource spends what the plan is keeping; take it only when the plan says so.",
			...(help ? [`If no option carries out the plan, or the position no longer fits it, choose ${HELP}. Do not invent a new line.`] : []),
		] : []),
		...(packet.routes.length ? ["Some ids are asks rather than moves: an ask shows the rules it names, changes nothing, and brings this decision back.",
			"The rule that decides this may not be among them."] : []),
	];
	return {
		type: "choice",
		instructions: lines.join("\n"),
		criteria: Object.fromEntries([
			...packet.options.map((option) => [option.id, [option.label, option.shows].filter(Boolean).join(". ")]),
			...packet.routes.map((route) => [route.id, `Ask to see ${route.does}. Acts on nothing and returns to this decision.`]),
			...(help ? [[HELP, "The plan does not fit this position: ask strategy for a new plan. Moves nothing."]] : []),
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
			const reason = planReason(frame);
			const revision = frame.view.work?.revision ?? 0;
			if (reason) {
				if (!options.plan) throw new Error(`Strategy requested, but no planner is available: ${reason}`);
				const { tools, objection } = await options.plan(frame);
				return { kind: "work", tools, revision, actionId: `${options.name}-${frame.version}-${revision}-plan-${++asked}`, ...(objection ? { objection } : {}) };
			}
			// Help is offered while a planner exists and this decision has not already been refused a new plan.
			const help = !!options.plan && !!frame.view.work && !frame.refused?.some((why) => why.includes("requests for a new plan are spent"));

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
				asked += 1;
				options.onAsk?.(packet);
				const answers = await options.api.ask({
					state: asState(packet),
					questions: { [KEY]: question(packet, help) },
				});

				const answer = chose(answers, KEY);
				if (typeof answer === "string") {
					// Returned to the loop unchanged. It owns the retry and the
					// fallback accounting, and replacing this with the first option
					// would lose the difference between a choice and a fallback.
					options.onGap(`${options.name} via ${options.api.named}: ${answer}`);
					return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
				}
				if (answer.choice === HELP && help) {
					const due = packet.plan?.due ? ` Due step: ${packet.plan.due}.` : "";
					return { kind: "work", tools: [{ do: "plan.request", reason: `The pilot asked for help: ${frame.decision.question}${due} No listed option fit the plan.` }],
						revision, actionId: `${options.name}-${frame.version}-${revision}-help-${asked}` };
				}
				const route = packet.routes.find((candidate) => candidate.id === answer.choice);
				if (!route) return { kind: "pick", option: answer.choice, actionId: `${options.name}-${asked}` } satisfies Answer;
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
