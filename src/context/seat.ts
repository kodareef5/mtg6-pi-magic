/**
 * A classifier seat flies its plan: it takes the step that is due, takes a
 * branch when its situation comes, follows rule routes, and asks for a new plan
 * when the one it has no longer fits. Strategy writes the plan; focus builds
 * the decision packet without inference.
 *
 * While the opponent plays, it prepares its own next turn in the background,
 * and at the draw it uses the prepared plan or amends it for what changed.
 * There is one planner per seat, no challenger or parallel replacement plan.
 *
 * Raw declarations and free-form delegation still lack game handlers.
 * Past 150 lines to keep the question beside its navigation and answer handling.
 */

import { PlayerUnavailable, type Answer, type Objection, type Player } from "../core/player.ts";
import type { Rules } from "../core/rules.ts";
import type { Frame } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { dial, follow } from "./dial.ts";
import { asState, chose, CHOICE_LIMIT, type DecisionApi, type Question } from "./model.ts";
import { focus, type Chronicle, type Packet } from "./packet.ts";
import type { NoteEdit, WorkCommand } from "../core/work-language.ts";
import { planReason } from "../core/planning.ts";
import { planProblems } from "../core/work-tools.ts";
import type { Package, Plan, PlanOption } from "../core/language.ts";
import type { SeenObject } from "../core/work.ts";
import { budget } from "../core/budget.ts";
import { holds, viewWorld } from "../core/selectors.ts";
import { matches, select } from "../core/query.ts";
import { STEPS } from "../core/steps.ts";
import { putting } from "./strategy.ts";
import { inspect, type Inspection } from "./choices.ts";
import { decisionChoices } from "./packet.ts";

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
	/** Prepare one identified card's uses; the core records the returned equipment before any pick. */
	interpret?(frame: Frame): Promise<Package>;
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
	/** The same planner handles a new turn, an amendment and a stop. */
	plan?(frame: Frame, prepared?: Prepared, changed?: string[]): Promise<{ tools: WorkCommand[]; objection?: Objection }>;
	/** One cancellable preparation during the opponent's turn. */
	prepare?(frame: Frame, signal: AbortSignal): Promise<Prepared>;
	/** Actual wait at the decision boundary, including unsuccessful planning. */
	onPlanned?(planned: Planned): void;
};

/** Private pending work; nothing reaches core until the turn's draw is accessible. */
export type Prepared = { plan: Plan; edits?: NoteEdit[] };
export type Planned = { seat: number; turn: number; how: "prepared" | "amended" | "written" | "escalation"; waitedMs: number; ready?: boolean; failed?: boolean };

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
		...(JSON.stringify(from.view.pools ?? []) !== JSON.stringify(now.view.pools ?? []) ? ["the mana pools changed"] : []),
		...(now.view.actions?.some((one) => !one.turnDraw && one.what.some((line) => !["no attackers", "no blockers"].includes(line)) && !from.view.actions?.some((earlier) => earlier.row === one.row)) ? ["the opponent took new actions; inspect view.actions"] : []),
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
		const at = frame.view.window;
		if (at.kind !== "turn") return false;
		const step = one.when.step ?? "precombat-main";
		const window = { ...at, step, phase: STEPS[step].phase };
		if (!matches(one.when, { ...frame, view: { ...frame.view, window } })) return false;
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
	const stage = packet.inspection?.stage;
	const instructions = [packet.obligation,
		"Choose one listed id using the supplied facts and this seat's preparation. Acceptance does not certify card meaning or rules legality.",
		"options describes the choices; uses holds shared source, timing, effect, target-slot terms and notes; payments holds costs and paid mana ids; funding holds the referenced mana abilities, while pools names existing mana and its restrictions. Read these references together. Printed cards and current characteristics are separate.",
		...(stage ? [stage === "use" ? "Choose the prepared use that applies now. An inspect choice asks about its alternatives and moves nothing."
			: stage === "component" ? "Inspect the named component or inclusive range. inspection.path records earlier filters; these are not committed choices. A later question asks for a complete original action. Backtracking restores alternatives."
			: stage === "choice" ? "Choose a complete original action. parameters names its components. Earlier inspection filters committed nothing; the selected action includes every listed component."
			: stage === "binding" ? "Choose the targets and X for this prepared use. Inspection declares no targets and spends nothing."
			: "Choose a complete original move with these bindings and a payment that preserves the plan's commitments. Back returns to all uses without acting."] : []),
		...(packet.opening ? ["Apply the opening policy to this hand and its remaining obligation. For bottom choices, retained shows the hand after each choice; preserve the policy's resource requirements."] : []),
		...(packet.retained ? ["retained shows the hand after each discard. Apply the prepared retention policy to the remaining cards and resources."] : []),
		...(packet.combat ? ["combat shows the developing declaration and assignments. Compare the plan with current flying, reach, menace, sickness and damage. Finish the declaration explicitly; selecting a creature is not finishing combat."] : []),
		...(packet.resolving ? ["Complete the accepted use under resolving.purpose and its original guidance. Its costs are already paid. This is an instruction choice, not priority. Declining a search deliberately finds nothing; it is not a pass.",
			"resolution holds the current instruction and earlier bindings. Resolve against the actual locked targets, including their legality; a completed announcement is not a completed effect."] : []),
		...(packet.objects.some((one) => one.zone === "stack") && !packet.resolving ? ["The stack is waiting. Land plays and uses at sorcery speed need an empty stack. Their absence alone does not require a new plan. Apply the prepared response policy now. Passing lets the top object resolve after every seat passes; it does not end the phase or guarantee a later use will become available.",
			"Read named stack targets and order before responding. An effect already pending on a target has not resolved; paying again starts another use."] : []),
		...(packet.plan ? ["Follow the current plan and phase guidance. A held resource can be spent only under its release policy. A waiting prerequisite is not an unavailable line; a contradicted assumption may need a covered alternative or a revision."] : []),
		...(packet.plan?.next.length ? ["plan.next names unfinished actions whose window is closed or condition is false. Read when beside each label. A main-phase cast cannot happen during upkeep or draw; use the current response policy and choose the passes needed to reach its window. An unrelated available activation is not a substitute for that later action and may spend its mana. Ask for help if an uncovered event requires changing the line."] : []),
		...(packet.checklist?.length ? ["checklist describes the plan now: available means a listed use; later means after an earlier available step; waiting means a use requiring an empty stack; condition-false means its stated condition is false; unavailable means no current option. None completes a step. recorded means the phase's explicit steps are in the ledger, not that its goal is guaranteed. Follow the order and prepared response policies; do not optimize a new line.",
			"Before choosing a pass or declaration ending, check remaining actions against the phase guidance. Confirm that no planned action is required now. A pending effect can require waiting. An unavailable required line or an uncovered change needs help; silence in the plan alone is not a passing policy."] : []),
		...(help ? ["Ask for help when the position contradicts the line and no prepared alternative covers it. Explain the conflict through the supplied use, targets, payments and remaining work; do not invent a strategy."] : []),
		...(packet.routes.length ? ["Rule asks show the named rule and return to this decision without acting."] : []),
		...(packet.learned?.length ? ["learned contains the cited rules you asked to see; they are reference text, not actions."] : []),
		...(packet.refused?.length ? ["refused explains the previous unusable answer. The physical decision is unchanged."] : []),
	].join("\n");
	return { type: "choice", instructions, criteria: Object.fromEntries([
		...packet.options.map((option) => [option.id, ["pass", "attack:done", "block:done"].includes(option.id) && packet.checklist?.length
			? `Confirm the plan's current completion or waiting conditions, then choose ${option.label}. This records the physical choice, not completion of any unperformed step.`
			: `Select the option with this id: ${option.label}. Read its bindings, payment and notes in options.`]),
		...packet.routes.map((route) => [route.id, `Ask to see ${route.does}. Acts on nothing.`]),
		...(help ? [[HELP, "Request a revision of the unfinished line. Moves nothing."]] : []),
	]) };
}

export function aiSeat(options: AiSeatOptions): Player {
	let asked = 0;
	let closed = false;
	let preparation: { turn: number; from: Frame; controller: AbortController; plan: Promise<Prepared | undefined>; ready?: true } | undefined;
	let began: string | undefined;
	let navigation: { version: number; revision: number; learned: string[]; walked: string[]; selected: Inspection } | undefined;
	const cancel = () => {
		const old = preparation;
		preparation = undefined;
		old?.controller.abort(new Error("Preparation discarded."));
		return old?.plan;
	};
	const begin = (frame: Frame) => {
		const at = frame.view.window;
		if (closed || !options.prepare || at.kind !== "turn" || at.active === frame.seat || !frame.view.work?.eachTurn || frame.view.work.request) return;
		const key = `${at.turn + 1}:${frame.view.work.planned ?? 0}`;
		if (began === key) return;
		const cancelled = cancel();
		began = key;
		const controller = new AbortController();
		const job: NonNullable<typeof preparation> = { turn: at.turn + 1, from: frame, controller,
			plan: Promise.resolve(cancelled).then(() => { controller.signal.throwIfAborted(); return options.prepare!(frame, controller.signal); }).catch(() => undefined) };
		preparation = job;
		void job.plan.then(() => { job.ready = true; });
	};

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
			if (closed) throw new Error(`${options.name} is closed.`);
			if (frame.decision.preparation?.length) {
				if (!options.interpret) throw new PlayerUnavailable("Known card uses need preparation, but this seat has no interpreter.");
				const pack = await options.interpret(frame);
				if (closed) throw new PlayerUnavailable("Seat closed during card interpretation.");
				return { kind: "work", tools: [{ do: "package.put", package: pack }], revision: frame.view.work?.revision ?? 0,
					actionId: `${options.name}-${frame.version}-interpret-${++asked}` };
			}

			// Preparation changes only on a recorded request. A phase change
			// alone is not a reason for a model call.
			const seated = options.chronicle;
			const budget = options.dials ?? 2;
			if (navigation?.version !== frame.version || navigation.revision !== (frame.view.work?.revision ?? 0)) navigation = { version: frame.version, revision: frame.view.work?.revision ?? 0, learned: [], walked: [], selected: {} };
			const { learned, walked } = navigation;
			const reason = planReason(frame);
			const revision = frame.view.work?.revision ?? 0;
			const at = frame.view.window;
			if (reason) {
				const started = Date.now(), turn = at.kind === "turn" ? at.turn : 0;
				let how: Planned["how"] = frame.view.work?.request ? "escalation" : "written";
				let ready: boolean | undefined, failed = true;
				try {
					let made: Prepared | undefined, changed: string[] | undefined;
					if (!frame.view.work?.request && at.kind === "turn" && preparation?.turn === at.turn) {
						const job = preparation;
						ready = !!job.ready;
						// Wait for this job rather than starting another planner beside it.
						made = await job.plan;
						if (closed) throw new Error(`${options.name} closed while planning.`);
						if (preparation === job) {
							preparation = undefined;
							if (made) {
								const delta = changes(job.from, frame);
								if (settled(frame, made.plan, delta)) {
									how = "prepared";
									failed = false;
									return { kind: "work", tools: putting(made), revision, actionId: `${options.name}-${frame.version}-${revision}-plan-${++asked}` };
								}
								changed = delta.lines;
								how = "amended";
							}
						} else made = undefined;
					} else await cancel();
					if (!options.plan) throw new Error(`Strategy requested, but no planner is available: ${reason}`);
					const { tools, objection } = await options.plan(frame, made, changed);
					if (closed) throw new Error(`${options.name} closed while planning.`);
					failed = false;
					return { kind: "work", tools, revision, actionId: `${options.name}-${frame.version}-${revision}-plan-${++asked}`, ...(objection ? { objection } : {}) };
				} finally {
					options.onPlanned?.({ seat: frame.seat, turn, how, waitedMs: Date.now() - started,
						...(ready === undefined ? {} : { ready }), ...(failed ? { failed: true } : {}) });
				}
			}
			// Help is offered while a planner exists and this decision has not already been refused a new plan.
			const help = !!options.plan && !!frame.view.work && !frame.refused?.some((why) => why.includes("requests for a new plan are spent"));

			for (;;) {
				const rules = options.rules && walked.length < budget ? options.rules : undefined;
				const capacity = CHOICE_LIMIT - (help ? 1 : 0) - dial(frame.decision, rules).filter((route) => !walked.includes(route.id)).length;
				const menu = inspect(decisionChoices(frame), navigation.selected, capacity);
				const whole = focus(frame, options.intent, {
					...(seated?.briefs[frame.seat] ? { brief: seated.briefs[frame.seat] } : {}),
					...(seated ? { recaps: seated.recaps } : {}),
					...(rules ? { rules } : {}),
					...(learned.length ? { learned } : {}),
					inspection: navigation.selected, capacity,
				});
				// A route already followed is not offered again. Its answer is
				// already in front of the seat, and offering it twice spends the
				// budget on something the seat has read.
				const packet = { ...whole, routes: whole.routes.filter((route) => !walked.includes(route.id)) };
				const ask = question(packet, help);
				asked += 1;
				options.onAsk?.(packet);
				const answers = await options.api.ask({
					state: asState(packet),
					questions: { [KEY]: ask },
				}, "pick");

				const answer = chose(answers, KEY);
				if (typeof answer === "string") {
					// Returned to the loop unchanged. It owns the retry and the
					// fallback accounting, and replacing this with the first option
					// would lose the difference between a choice and a fallback.
					options.onGap(`${options.name} via ${options.api.named}: ${answer}`);
					return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
				}
				if (Object.hasOwn(menu.enter, answer.choice)) {
					navigation.selected = menu.enter[answer.choice]!;
					continue;
				}
				if (answer.choice === HELP && help) {
					const due = packet.plan?.due ? ` Due step: ${packet.plan.due}.` : "";
					return { kind: "work", tools: [{ do: "plan.request", reason: `The pilot asked for help: ${frame.decision.question}${due} Review the conflict with the current position and repair the unfinished line.` }],
						revision, actionId: `${options.name}-${frame.version}-${revision}-help-${asked}` };
				}
				const route = packet.routes.find((candidate) => candidate.id === answer.choice);
				if (!route) return { kind: "pick", option: answer.choice, actionId: `${options.name}-${asked}` } satisfies Answer;
				walked.push(route.id);
				learned.push(...follow(route, options.rules!));
				options.onDial?.(route.id);
			}
		},

		observe(frame) {
			if (preparation && (frame.version < preparation.from.version || frame.view.work?.planned !== preparation.from.view.work?.planned)) cancel();
			begin(frame);
		},
		reset() { cancel(); began = undefined; navigation = undefined; },
		close() { closed = true; return cancel()?.then(() => {}); },
	};
}
