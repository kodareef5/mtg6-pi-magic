/**
 * A classifier seat flies its plan: it takes the step that is due, takes a
 * branch when its situation comes, follows rule routes, and asks for a new plan
 * when the one it has no longer fits. Strategy writes the plan; focus builds
 * the decision packet without inference.
 *
 * While the opponent plays, it prepares its own next turn in the background,
 * and when that turn begins it offers the prepared plan: as it is when nothing
 * that matters changed, or after a short review.
 *
 * Raw declarations and free-form delegation still lack game handlers.
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
import { planProblems } from "../core/work-tools.ts";
import type { Plan, PlanOption } from "../core/language.ts";
import type { SeenObject } from "../core/work.ts";
import { budget } from "../core/budget.ts";
import { holds, viewWorld } from "../core/selectors.ts";
import { select } from "../core/query.ts";

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
	/** Prepares this seat's next turn while the opponent plays. Without it the turn is planned when it begins. */
	prepare?(frame: Frame): Promise<Plan>;
	/**
	 * Challenges a prepared plan in the background, and revises it once if it found errors. Never waited on.
	 * The errors are passed to `criticized` as soon as they are found, so a revision still running, or failed, does not lose them;
	 * it answers whether a revision is still wanted.
	 */
	challenge?(frame: Frame, prepared: Plan, criticized: (errors: string[]) => boolean): Promise<Plan | undefined>;
	/** Checks a prepared plan when the turn begins, given what changed since it was prepared. */
	review?(frame: Frame, prepared: Plan, changed: string[]): Promise<{ tools: WorkCommand[]; objection?: Objection }>;
	/** Called each time the seat waited on strategy for its plan: how the plan came, how long the table waited, and whether a preparation was ready. */
	onPlanned?(planned: Planned): void;
};

/** How a seat's plan came: a prepared plan as it was, after a review, written at the time, or written for a stop or a request. */
export type Planned = { seat: number; turn: number; how: "prepared" | "reviewed" | "written" | "escalation"; waitedMs: number; ready?: boolean };

/**
 * What changed between the frame a plan was prepared from and the turn it is for,
 * in this seat's words: permanents either side gained, lost or changed (counters,
 * characteristics, registrations, attachments, a tapped permanent of the
 * opponent's), notes, cards drawn or lost from hand, life, and a plan replaced in
 * between. Untapping our own permanents and the opponent's own untap are expected
 * and not changes. `quiet` is nothing changed but the draw.
 */
export function changes(from: Frame, now: Frame): { lines: string[]; drawn: SeenObject[]; quiet: boolean } {
	const at = (frame: Frame, zone: string, mine: boolean) => (frame.view.objects ?? []).filter((object) => object.zone === zone && (object.controller === frame.seat) === mine);
	const same = (object: SeenObject, other: SeenObject) => other.id === object.id && other.incarnation === object.incarnation;
	const kept = (object: SeenObject, among: SeenObject[]) => among.some((other) => same(object, other));
	const name = (object: SeenObject) => object.card ?? object.token?.name ?? "a card";
	const gone = (zone: string, mine: boolean) => at(from, zone, mine).filter((object) => !kept(object, at(now, zone, mine)));
	const added = (zone: string, mine: boolean) => at(now, zone, mine).filter((object) => !kept(object, at(from, zone, mine)));
	// A permanent as it matters to a plan. Ours untap at our turn and the opponent's untapped at theirs, so the opponent's tapped is read only now.
	const state = (object: SeenObject, before: boolean, mine: boolean) => JSON.stringify({ counters: object.counters, traits: object.traits, registrations: object.registrations,
		attached: object.attached, damage: object.damage, faceDown: object.faceDown, ...(mine ? {} : { tapped: before ? false : object.tapped }) });
	const altered = (mine: boolean) => at(now, "battlefield", mine).filter((object) => {
		const earlier = at(from, "battlefield", mine).find((other) => same(object, other));
		return earlier && state(earlier, true, mine) !== state(object, false, mine);
	});
	const life = (frame: Frame, mine: boolean) => frame.view.players?.find((one) => (one.id === frame.seat) === mine)?.life;
	const drawn = added("hand", true);
	const lines = [
		...gone("battlefield", true).map((object) => `your ${name(object)} left the battlefield`), ...added("battlefield", true).map((object) => `you now have ${name(object)}`),
		...altered(true).map((object) => `your ${name(object)} changed`),
		...gone("battlefield", false).map((object) => `the opponent's ${name(object)} left the battlefield`), ...added("battlefield", false).map((object) => `the opponent now has ${name(object)}`),
		...altered(false).map((object) => `the opponent's ${name(object)} changed${object.tapped ? " and is tapped" : ""}`),
		...gone("hand", true).map((object) => `${name(object)} left your hand`),
		...[true, false].flatMap((mine) => life(from, mine) !== life(now, mine) ? [`${mine ? "your" : "the opponent's"} life went from ${life(from, mine)} to ${life(now, mine)}`] : []),
		...(JSON.stringify(from.view.notes ?? []) !== JSON.stringify(now.view.notes ?? []) ? ["the table's notes changed"] : []),
		...(from.view.work?.planned !== now.view.work?.planned ? ["your standing plan was replaced since you prepared, by a stop, a request for help or a judge's ruling"] : []),
	];
	return { lines: [...lines, ...drawn.map((object) => `you drew ${name(object)}`)], drawn, quiet: !lines.length };
}

/**
 * A prepared plan that needs no review: nothing but the draw changed, the plan
 * still passes every check and the arithmetic, and each card drawn is one a step
 * or a branch would take now: a land a land step selects, or a card a step or a
 * branch whose condition holds selects.
 */
export function settled(frame: Frame, prepared: Plan, changed: ReturnType<typeof changes>): boolean {
	if (!changed.quiet || planProblems(frame, prepared).length || budget(frame, prepared).length) return false;
	const scope = { world: viewWorld(frame.view), controller: frame.seat };
	const takes = (one: PlanOption, card: SeenObject) => {
		if (one.if && !holds(scope, one.if)) return false;
		const action = one.action;
		if ("procedure" in action) return select({ ...action.procedure.source, zones: action.procedure.source.zones ?? ["hand"] }, frame).some((object) => object.id === card.id);
		const id = action.option ?? action.prefix ?? "";
		if (action.objects) return select(action.objects, frame).some((object) => object.id === card.id);
		return !action.option && id === "land:" && !!card.traits?.types.includes("land");
	};
	return changed.drawn.every((card) => [...prepared.steps, ...(prepared.may ?? [])].some((one) => takes(one, card)));
}

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
		...(plan ? ["", `Your plan: ${plan.objective}`, plan.guidance, ...plan.phase.map((line) => `Now: ${line}`),
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
	// The next own turn being prepared, from the frame it was prepared from. A failed preparation is undefined and the turn is planned as usual.
	// A challenger's revision replaces it only if it is already done when the turn begins; its errors, once found, are kept either way.
	// A job is current only while it is this variable: one taken, replaced or closed starts nothing more and is never used.
	let preparation: { turn: number; from: Frame; plan: Promise<Plan | undefined>; ready?: true; criticism?: string[]; revised?: Plan } | undefined;
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
			const at = frame.view.window;
			// The turn's plan, prepared during the opponent's turn: offered as it is, or after a short review.
			const started = Date.now(), turn = at.kind === "turn" ? at.turn : 0;
			const planned = (how: Planned["how"], ready?: boolean) => options.onPlanned?.({ seat: frame.seat, turn, how, waitedMs: Date.now() - started, ...(ready === undefined ? {} : { ready }) });
			if (reason && !frame.view.work?.request && at.kind === "turn" && preparation?.turn === at.turn) {
				const job = preparation, ready = !!job.ready;
				preparation = undefined;
				const prepared = job.revised ?? await job.plan;
				if (prepared) {
					const changed = changes(job.from, frame), id = `${options.name}-${frame.version}-${revision}-prepared-${++asked}`;
					// A challenge's errors that no finished revision answered stand against the plan until the writer has read them.
					const criticism = job.revised ? [] : (job.criticism ?? []).map((error) => `a challenge of the prepared plan found: ${error}`);
					if (!criticism.length && settled(frame, prepared, changed)) {
						planned("prepared", ready);
						return { kind: "work", tools: [{ do: "plan.put", plan: prepared }], revision, actionId: id };
					}
					if (options.review) {
						const { tools, objection } = await options.review(frame, prepared, [...changed.lines, ...criticism]);
						planned("reviewed", ready);
						return { kind: "work", tools, revision, actionId: id, ...(objection ? { objection } : {}) };
					}
				}
			}
			if (reason) {
				if (!options.plan) throw new Error(`Strategy requested, but no planner is available: ${reason}`);
				const { tools, objection } = await options.plan(frame);
				planned(frame.view.work?.request ? "escalation" : "written");
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
			// The opponent's turn has begun: prepare ours, once, from what can be seen now.
			const at = frame.view.window, work = frame.view.work;
			if (options.prepare && at.kind === "turn" && at.active !== frame.seat && work?.eachTurn && work.accepted !== undefined && preparation?.turn !== at.turn + 1) {
				const job: NonNullable<typeof preparation> = { turn: at.turn + 1, from: frame, plan: options.prepare(frame).catch(() => undefined) };
				preparation = job;
				void job.plan.then(() => { job.ready = true; });
				const challenge = options.challenge;
				if (challenge) void job.plan.then((prepared) => prepared && preparation === job ? challenge(frame, prepared, (errors) => { job.criticism = errors; return preparation === job; }) : undefined)
					.then((revised) => { if (revised) job.revised = revised; }, () => undefined);
			}
		},

		close() {
			latest = undefined;
			preparation = undefined;
			void latest;
		},
	};
}
