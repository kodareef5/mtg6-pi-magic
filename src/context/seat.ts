/**
 * A classifier seat flies its plan: it takes the step that is due, takes a
 * branch when its situation comes, follows rule routes, and asks for a new plan
 * when the one it has no longer fits. Strategy writes the plan; focus builds
 * the decision packet without inference.
 *
 * While the opponent plays, it prepares its own next turn in the background,
 * and at its acceptance deadline uses the plan or amends it for what changed.
 * There is one planner per seat, no challenger or parallel replacement plan.
 *
 * Raw declarations and free-form delegation still lack game handlers.
 * Past 150 lines to keep the question beside its navigation and answer handling.
 */

import { isDeepStrictEqual } from "node:util";
import { basePlan, conditionProblems } from "./plan-edit.ts";
import { PlayerUnavailable, type Answer, type Objection, type Player } from "../core/player.ts";
import type { Rules } from "../core/rules.ts";
import type { Frame, Option } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { dial, follow } from "./dial.ts";
import { asState, chose, CHOICE_LIMIT, RequestTooLarge, type DecisionApi, type Question } from "./model.ts";
import { compact, focus, STATUS, type Chronicle, type Packet } from "./packet.ts";
import type { NoteEdit, WorkCommand } from "../core/work-language.ts";
import { placed, planReason, planState, triggerOrder } from "../core/planning.ts";
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
	/** A judge is seated and can hear a chosen objection. */
	judge?: boolean;
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
	/** The decision version at which this seat already asked for help, when a seat is rebuilt mid-decision. */
	helpedAt?: number;
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

/** Private pending work; core receives it only at the scheduled acceptance deadline. */
export type Prepared = { plan: Plan; edits?: NoteEdit[] };
type PreparationTiming = { fromVersion: number; fromTurn: number; queuedAt: number; startedAt?: number; finishedAt?: number; neededAt?: number };
export type Planned = { seat: number; turn: number; how: "prepared" | "amended" | "written" | "escalation" | "kept"; waitedMs: number; ready?: boolean; failed?: boolean; preparation?: PreparationTiming };

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
	if (prepared.throughTurn !== undefined && frame.view.window.kind === "turn" && frame.view.window.turn > prepared.throughTurn) return false;
	if (!changed.quiet || planProblems(frame, prepared).length || budget(frame, prepared).length) return false;
	const scope = { world: viewWorld(frame.view), controller: frame.seat };
	const takes = (one: PlanOption, card: SeenObject) => {
		const at = frame.view.window;
		if (at.kind !== "turn") return false;
		const remaining = frame.view.remainingSteps ?? [at.step];
		if (!remaining.some((step) => matches(one.when, { ...frame, view: { ...frame.view,
			window: { ...at, step, phase: STEPS[step].phase } } }))) return false;
		if (one.if && !holds(scope, one.if)) return false;
		const action = one.action;
		if ("procedure" in action) return select({ ...action.procedure.source, zones: action.procedure.source.zones ?? ["hand"] }, frame).some((object) => object.id === card.id);
		const id = action.option ?? action.prefix ?? "";
		if (action.objects) return select(action.objects, frame).some((object) => object.id === card.id);
		return !action.option && id === "land:" && !!card.traits?.types.includes("land");
	};
	return changed.drawn.every((card) => [...prepared.steps, ...(prepared.may ?? [])].some((one) => takes(one, card)));
}

/** Reuse only a witnessed accepted position followed by its covered rules draw.
 * A resumed seat without that observation asks the writer. No snapshot enters the table. */
export function coveredDraw(from: Frame, frame: Frame): boolean {
	const at = frame.view.window, old = from.view.window, work = frame.view.work;
	if (at.kind !== "turn" || old.kind !== "turn" || at.active !== frame.seat || old.turn !== at.turn ||
		old.active !== at.active || frame.decision?.situation !== "priority" || work?.request ||
		!work?.plan || work.accepted !== from.version || work.planned !== from.view.work?.planned ||
		!frame.view.drawnAt || frame.view.drawnAt <= from.version) return false;
	const drawn = frame.view.turnDraw ?? [];
	if (!drawn.length) return false;
	const isDrawn = (one: SeenObject) => drawn.some((card) => card.id === one.id && card.incarnation === one.incarnation);
	const received = frame.view.objects?.filter(isDrawn) ?? [];
	if (received.length !== drawn.length || received.some((one) => one.zone !== "hand" || one.controller !== frame.seat)) return false;
	const position = (seen: Frame, after: boolean) => ({
		objects: seen.view.objects?.filter((one) => !after || !isDrawn(one)),
		players: seen.view.players?.map((one) => !after || one.id !== frame.seat ? one : {
			...one, hand: (one.hand ?? 0) - drawn.length, library: (one.library ?? 0) + drawn.length }),
		notes: seen.view.notes, pools: seen.view.pools, combat: seen.view.combat,
		resolution: seen.view.resolution, history: seen.view.history, lands: seen.view.landsPlayed,
		packages: seen.view.work?.packages, notebook: seen.view.work?.notebook,
	});
	return isDeepStrictEqual(position(from, false), position(frame, true)) &&
		settled(frame, basePlan(frame), { quiet: true, lines: [], drawn: received });
}

/**
 * A preparation that can stand through upkeep unreviewed: a plain upkeep priority
 * with an empty stack, a mechanically sound line, and nothing it would do before
 * the draw. The post-draw review then reads everything that changed since it was
 * prepared, so one writer session covers the opponent's turn and the draw together.
 */
export function installable(frame: Frame, plan: Plan): boolean {
	const at = frame.view.window;
	if (at.kind !== "turn" || at.active !== frame.seat || at.step !== "upkeep" || frame.decision?.situation !== "priority" || frame.view.work?.request) return false;
	if (plan.throughTurn !== undefined && at.turn > plan.throughTurn) return false;
	if ((frame.view.objects ?? []).some((one) => one.zone === "stack")) return false;
	if (planProblems(frame, plan).length || conditionProblems(plan).length || budget(frame, plan).length) return false;
	return ![...plan.steps, ...(plan.may ?? [])].some((one) => matches(one.when, frame));
}

/**
 * What the pilot was looking at when it asked: the window, the stack, the due step
 * and the remaining steps with their windows. This records observations;
 * the strategy request and submit schema define the reply.
 */
export function helpRequest(frame: Frame, packet: Packet): string {
	const at = frame.view.window;
	const where = at.kind === "turn" ? `${at.active === frame.seat ? "your" : "the opponent's"} turn ${at.turn}, ${at.step}` : "the opening";
	const stack = (frame.view.objects ?? []).filter((one) => one.zone === "stack").sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map((one) => one.card ?? one.token?.name ?? "an ability");
	const plan = packet.plan;
	const next = (plan?.next ?? []).map((one) => `${one.label} (${one.status === "condition-false" ? "its condition is false now"
		: one.scheduled ? `${one.scheduled.step}${at.kind === "turn" && one.scheduled.turn !== at.turn ? ` of turn ${one.scheduled.turn}` : ""}` : "no window left this turn"})`);
	const blocked = (packet.checklist ?? []).filter((one) => one.kind !== "phase" && [STATUS.unavailable, STATUS.waiting].includes(one.status))
		.map((one) => `${one.label} (${one.status})`);
	return [`The pilot asked for help at ${where}: ${frame.decision?.question ?? ""}`,
		...(plan?.due ? [`Due step: ${plan.due}.`] : []),
		...(blocked.length ? [`Unfinished in this window: ${blocked.join("; ")}.`] : []),
		stack.length ? `On the stack: ${stack.join(", ")}.` : "The stack is empty.",
		next.length ? `Later planned steps: ${next.join("; ")}.` : "No later step is planned this turn.",
		...(!plan?.due ? ["No ordered action is due in this window."] : [])].join(" ");
}

/** Sentences joined so each ends once. */
const sentences = (parts: (string | undefined)[]) => parts.filter((one): one is string => !!one?.trim()).map((one) => one.trim().replace(/([^.!?])$/, "$1.")).join(" ");

/** One template for every option: what it does, its facts, then what the plan says about it, including marks shared by all variants of its use. */
export const criterion = (option: Packet["options"][number], packet: Pick<Packet, "uses">) =>
	sentences([option.label, option.shows, ...(option.use ? packet.uses[option.use]?.notes ?? [] : []), ...(option.notes ?? [])]);

/** Questions one decision may take, inspections, routes and narrowing included, before the seat stops walking and asks for a new plan. */
const WALK_LIMIT = 24;
/** The fewest options a refused request is narrowed to before the refusal stands. */
const FIT_FLOOR = 8;
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
export function question(packet: Packet, help: boolean, order?: { by: "plan" | "pilot"; placement: readonly string[]; aim?: string; kept?: boolean }): Question {
	const stage = packet.inspection?.stage;
	const instruction = packet.resolution?.program[0]?.instruction;
	const search = instruction?.do === "choose" && instruction.from.zones?.length === 1 && instruction.from.zones[0] === "library" &&
		!instruction.from.is && !instruction.from.linked && packet.resolution?.program.some((one) => one.instruction.do === "shuffle" && one.instruction.who === instruction.who);
	const options = packet.options, stacked = packet.objects.some((one) => one.zone === "stack");
	const instructions = [packet.obligation,
		// Stated in placement order: the trigger named first is the one that goes on now.
		...(order && order.placement.length > 1 ? [`${order.by === "plan" ? "Your plan's trigger order" : "Your stated order"} puts your waiting triggers on the stack in this order: ${placed(order.placement, order.aim)}. ${order.kept === false ? `No listed option puts ${order.placement[0]} on aiming at ${order.aim ?? "the target your plan names"}.` : "The option that keeps it says so."}`] : []),
		...(packet.kind === "trigger-order" && packet.plan ? ["Choose targets as your plan gives them."] : []),
		"Choose one id from the criteria. Each criterion says what that option does and what your plan says about it.",
		...orientation(packet),
		...(packet.window.kind === "turn" && !packet.resolving && packet.kind !== "trigger-order" ? [stacked
			? "The stack is not empty, so lands and sorcery-speed actions wait until it is; their absence now is no reason to ask for help. An object on the stack has not resolved yet; using its card again starts another use."
			: "The stack is empty."] : []),
		...(options.some((one) => one.id.startsWith("inspect:use") || one.id.startsWith("inspect:binding")) ? ["An inspect option opens one use's targets and payments; it takes no action."] : []),
		...(stage === "binding" ? ["Choose the targets; the payment comes next."] : stage === "payment" ? ["Choose how to pay. inspect:back returns to all uses."] : stage === "component" ? ["Choose a range to narrow the options; this takes no action."] : []),
		...(options.some((one) => one.parameters) ? ["An option with parameters takes all of its parts at once."] : []),
		...(packet.opening ? ["state.opening shows your hand. Follow the opening advice in pregameNotes."] : []),
		...(packet.retained ? ["retained shows the hand left after each choice."] : []),
		...(packet.combat ? ["Choosing a creature adds it to the declaration; only the finish option ends it. state.combat shows the declaration so far."] : []),
		...(packet.resolving ? ["You are resolving an effect whose costs are paid. Follow resolving.purpose."] : []),
		...(search ? ["Choose the card the search's purpose names. Declining finds nothing; it is not a pass."] : []),
		...(packet.checklist?.length ? ["checklist shows each planned action for this window and whether an option here takes it."] : []),
		...(help ? [HELP_LINE] : []),
		...(packet.blockDeclaration ? ["blockDeclaration shows the block assignment just made."] : []),
		...(packet.routes.length ? ["A rules: option shows a rule and returns to this decision."] : []),
		...(packet.learned?.length ? ["learned holds the rules you looked up."] : []),
		...(packet.refused?.length ? ["refused says why your last answer could not be used."] : []),
		...(packet.repeated ? [`You have met this same decision in this same position ${packet.repeated} times in this step: your earlier answers led back to it.`] : []),
	].join("\n");
	return { type: "choice", instructions, criteria: Object.fromEntries([
		...packet.options.map((option) => [option.id, criterion(option, packet)]),
		...(packet.objection ? [[packet.objection.id, `Ask the judge whether action ${packet.objection.row} declared legal blocks. The judge reconstructs declaration-time evidence and may let it stand or roll back. This choice takes no physical action and does not revise strategy.`]] : []),
		...packet.routes.map((route) => [route.id, `Ask to see ${route.does}. Acts on nothing.`]),
		...(help ? [[HELP, helpCriterion(packet)]] : []),
	]) };
}

/** Where the plan and the board are in the state, worded the same for every question. */
const orientation = (packet: Packet) => [
	...(packet.plan ? [`state.plan is your plan: plan.due is the step to take now, with its Choices; plan.script holds the guidance for this window; plan.held lists what the plan keeps for later.${packet.plan.next.length ? " plan.next lists later steps with their windows; they are not taken now, and an unrelated option taken now can spend what they need." : ""}`] : []),
	...(packet.pregameNotes.length && packet.plan ? ["Your plan outranks pregameNotes, which were written before the game."] : []),
	"state.objects is the board now; state.cards is printed card text."];
const HELP_LINE = "ask:help asks your strategist for a new plan and takes no action. Use it when your plan's step for this window has no option here, or the board contradicts something the plan relies on.";
const helpCriterion = (packet: Packet) => sentences(["Ask your strategist for a new plan. This takes no action", packet.plan?.script?.askWhenDone ? "Your plan asks for help once this window's planned actions are done" : undefined]);

/** One waiting trigger of this seat's, shared by each of its target choices. A trigger with no legal target is removed, never resolved, so it has no place in the order. */
export type Waiting = NonNullable<Option["trigger"]>;
export function waitingTriggers(options: readonly Option[]): Waiting[] {
	return [...new Map(options.flatMap((one) => one.trigger ? [[one.trigger.id, one.trigger] as const] : [])).values()];
}

/**
 * One question of the order sequence: which of two waiting triggers resolves
 * first. Plans state resolution order, so the seat asks in that direction, one
 * pair at a time; answering moves nothing. The puts that follow are ordinary
 * decisions, one at a time.
 */
export function orderQuestion(packet: Packet, pair: readonly [Waiting, Waiting], help: boolean): { packet: Packet; question: Question } {
	const asked = `Which of these two waiting triggers should resolve first: ${pair[0].name} or ${pair[1].name}?`;
	// Each claim says both directions, so it reads the same against a plan that states resolution or placement order.
	const options = pair.map((one, at) => ({ id: `order:${one.id}`, label: `${one.name} resolves before ${pair[1 - at]!.name}, so ${pair[1 - at]!.name} goes on the stack first. Its trigger: ${one.text}` }));
	const shown: Packet = { ...packet, obligation: asked, options, uses: {}, payments: {}, funding: {}, routes: [] };
	return { packet: shown, question: { type: "choice", instructions: [asked,
		"This answer moves nothing. After these questions you put the triggers on the stack one at a time and choose their targets; triggers put on later resolve first.",
		"Choose one id from the criteria. Each criterion states one order for these two triggers, both as they resolve and as they go on the stack, and quotes its trigger.",
		...orientation(packet),
		...(help ? ["ask:help asks your strategist for a new plan and takes no action. Use it when the board contradicts something the plan relies on."] : [])].join("\n"),
	criteria: Object.fromEntries([...options.map((one) => [one.id, sentences([one.label])]), ...(help ? [[HELP, helpCriterion(packet)]] : [])]) } };
}

export function aiSeat(options: AiSeatOptions): Player {
	let asked = 0;
	let accepted: Frame | undefined;
	const remember = (frame: Frame) => {
		if (frame.version === frame.view.work?.accepted) accepted = frame;
	};
	let closed = false;
	// A preparation installed at upkeep without review, and the frame it was prepared from.
	let unreviewed: { turn: number; from: Frame } | undefined;
	let helped: number | undefined = options.helpedAt;
	let preparation: { turn: number; from: Frame; controller: AbortController; plan: Promise<Prepared | undefined>; ready?: true; timing: PreparationTiming } | undefined;
	let began: string | undefined;
	// `fit` is the option capacity this decision's requests fit into, once the classifier has refused a larger one.
	let navigation: { version: number; revision: number; learned: string[]; walked: string[]; selected: Inspection; fit?: number } | undefined;
	const cancel = () => {
		const old = preparation;
		preparation = undefined;
		old?.controller.abort(new Error("Preparation discarded."));
		return old?.plan;
	};
	const begin = (frame: Frame) => {
		const at = frame.view.window;
		if (closed || !options.prepare || at.kind !== "turn" || at.active === frame.seat || !frame.view.work?.eachTurn || frame.view.work.request) return;
		// The preparation starts from the playbook, not the standing plan, so a response
		// repair does not restart it; the post-draw review reads that change.
		const key = `${at.turn + 1}`;
		if (began === key) return;
		const cancelled = cancel();
		began = key;
		const controller = new AbortController();
		const timing: PreparationTiming = { fromVersion: frame.version, fromTurn: at.turn, queuedAt: Date.now() };
		const job: NonNullable<typeof preparation> = { turn: at.turn + 1, from: frame, controller, timing,
			plan: Promise.resolve(cancelled).then(() => { controller.signal.throwIfAborted(); timing.startedAt = Date.now(); return options.prepare!(frame, controller.signal); })
				.catch(() => undefined).finally(() => { timing.finishedAt = Date.now(); }) };
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
			remember(frame);
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
				let preparationTiming: PreparationTiming | undefined;
				try {
					const turnNow = at.kind === "turn" ? at.turn : -1;
					// A line installed unreviewed at upkeep still owes its review of the opponent's turn.
					if (accepted && unreviewed?.turn !== turnNow && coveredDraw(accepted, frame)) {
						how = "kept"; failed = false;
						return { kind: "work", tools: [{ do: "plan.keep", reason: "Only the rules draw changed; the accepted line covers every drawn card." }],
							revision, actionId: `${options.name}-${frame.version}-${revision}-keep-${++asked}` };
					}
					let made: Prepared | undefined, changed: string[] | undefined;
					if (!frame.view.work?.request && at.kind === "turn" && preparation?.turn === at.turn) {
						const job = preparation;
						ready = !!job.ready;
						preparationTiming = job.timing;
						preparationTiming.neededAt = Date.now();
						// Wait for this job rather than starting another planner beside it.
						made = await job.plan;
						if (closed) throw new Error(`${options.name} closed while planning.`);
						if (preparation === job) {
							preparation = undefined;
							if (made) {
								const delta = changes(job.from, frame);
								const install = !settled(frame, made.plan, delta) && installable(frame, made.plan);
								if (install || settled(frame, made.plan, delta)) {
									if (install) unreviewed = { turn: turnNow, from: job.from };
									how = "prepared";
									failed = false;
									return { kind: "work", tools: putting(made), revision, actionId: `${options.name}-${frame.version}-${revision}-plan-${++asked}` };
								}
								changed = delta.lines;
								how = "amended";
							}
						} else made = undefined;
					} else {
						// A repair during the opponent's turn leaves the next turn's preparation running, as begin intends;
						// the post-draw review reads what the repair changed. Anything else discards it.
						if (!(preparation && at.kind === "turn" && at.active !== frame.seat && preparation.turn > at.turn)) await cancel();
						// The post-draw review reads what changed since the line was prepared or last accepted.
						const since = unreviewed?.turn === turnNow ? unreviewed.from : accepted?.view.began === frame.view.began ? accepted : undefined;
						const draw = frame.view.drawnAt;
						if (since && !frame.view.work?.request && at.kind === "turn" && at.active === frame.seat && draw !== undefined &&
							(frame.view.work?.accepted ?? -1) < draw) changed = changes(since, frame).lines;
						unreviewed = undefined;
					}
					if (!options.plan) throw new Error(`Strategy requested, but no planner is available: ${reason}`);
					const { tools, objection } = await options.plan(frame, made, changed);
					if (closed) throw new Error(`${options.name} closed while planning.`);
					failed = false;
					return { kind: "work", tools, revision, actionId: `${options.name}-${frame.version}-${revision}-plan-${++asked}`, ...(objection ? { objection } : {}) };
				} finally {
					options.onPlanned?.({ seat: frame.seat, turn, how, waitedMs: Date.now() - started,
						...(ready === undefined ? {} : { ready }), ...(failed ? { failed: true } : {}),
						...(preparationTiming ? { preparation: { ...preparationTiming } } : {}) });
				}
			}
			// Help is offered while a planner exists and this decision has not already been refused a new plan.
			// One request per decision: once answered, the pilot chooses among the actual options.
			// No revised plan can change a decision whose only options pass or finish an empty declaration.
			const movable = frame.decision.options.some((one) => !["pass", "attack:done", "block:done"].includes(one.id));
			const help = !!options.plan && !!frame.view.work && movable && helped !== frame.version && !frame.refused?.some((why) => why.includes("requests for a new plan are spent"));

			// Before two or more of its triggers go on the stack, with no plan order for them, the seat asks which of each
			// pair should resolve first, in both orientations so a preference for a listed position cannot decide it. The
			// questions go out together, and again at each put about what still waits. The answers move nothing; each put
			// after them is its own decision.
			const waiting = waitingTriggers(frame.decision.options);
			// The plan's own trigger order, when it has one for these triggers, is already marked on the options by the table.
			const state = planState(frame), planned = state ? triggerOrder(state, frame.decision.options) : undefined;
			let order: Waiting[] = [];
			if (waiting.length > 1 && !planned) {
				const base = focus(frame, options.intent, { ...(seated?.briefs[frame.seat] ? { brief: seated.briefs[frame.seat] } : {}), ...(seated ? { recaps: seated.recaps } : {}), inspection: {}, capacity: CHOICE_LIMIT });
				const pairs = waiting.flatMap((first, at) => waiting.slice(at + 1).map((second) => [first, second] as const));
				const answered = await Promise.all(pairs.flatMap((pair) => [pair, [pair[1], pair[0]] as const]).map((shown) => {
					const { packet, question: ask } = orderQuestion(base, shown, help);
					asked += 1;
					options.onAsk?.(packet);
					return options.api.ask({ state: asState(compact(packet as unknown as Record<string, unknown>)), questions: { [KEY]: ask } }, "pick")
						.then((answers) => chose(answers, KEY), (error) => { if (error instanceof RequestTooLarge) return error; throw error; });
				}));
				const wins = new Map(waiting.map((one) => [one, 0]));
				let settled = true;
				for (const [at, pair] of pairs.entries()) {
					const both = answered.slice(2 * at, 2 * at + 2);
					if (both.some((answer) => answer instanceof RequestTooLarge)) { settled = false; continue; }
					const choices = both.map((answer) => typeof answer === "string" ? answer : (answer as { choice: string }).choice);
					// Help is asked for when both orientations of a pair ask for it.
					if (help && choices.every((choice) => choice === HELP)) {
						helped = frame.version;
						return { kind: "work", tools: [{ do: "plan.request", reason: helpRequest(frame, base) }],
							revision, actionId: `${options.name}-${frame.version}-${revision}-help-${asked}` };
					}
					const unusable = both.find((answer) => typeof answer === "string" || (answer as { choice: string }).choice !== HELP && !pair.some((one) => `order:${one.id}` === (answer as { choice: string }).choice));
					if (unusable !== undefined) {
						options.onGap(`${options.name} via ${options.api.named}: ${typeof unusable === "string" ? unusable : `${(unusable as { choice: string }).choice} is not a waiting trigger`}`);
						return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
					}
					const won = choices[0] === choices[1] ? pair.find((one) => `order:${one.id}` === choices[0]) : undefined;
					if (won) wins.set(won, wins.get(won)! + 1); else settled = false;
				}
				// An order is stated only when both orientations of every pair agree and the pairs are consistent: every trigger
				// then has a different number of wins. Otherwise the put is asked without one rather than with an invented one.
				if (settled && new Set(wins.values()).size === waiting.length) order = [...waiting].sort((a, b) => wins.get(b)! - wins.get(a)!);
			}
			// The put that keeps the stated order says so; every option stays offered.
			const shown: Frame = order.length ? { ...frame, decision: { ...frame.decision, options: frame.decision.options.map((one) => one.trigger?.id === order.at(-1)!.id
				? { ...one, notes: [...one.notes ?? [], "Your stated order puts this trigger on the stack now."] } : one) } } : frame;

			// Inspection and narrowing move nothing, so a walk that never settles is bounded: past it the seat asks for a new plan.
			let walking = 0;
			for (;;) {
				if (++walking > WALK_LIMIT) {
					const why = `The pilot inspected this decision ${WALK_LIMIT} times without choosing an option.`;
					if (help) { helped = frame.version; return { kind: "work", tools: [{ do: "plan.request", reason: why }], revision, actionId: `${options.name}-${frame.version}-${revision}-walk-${asked}` }; }
					options.onGap(`${options.name}: ${why}`);
					return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
				}
				const rules = options.rules && walked.length < budget ? options.rules : undefined;
				const declaration = frame.view.blockDeclaration;
				const objection = options.judge && declaration && declaration.seat !== frame.seat && declaration.blockers.length && !declaration.heard
					? { id: `object:block:${declaration.row}`, row: declaration.row, claim: `Check whether the complete blocking assignment at action ${declaration.row} satisfies declaration-time blocking restrictions.` } : undefined;
				const capacity = (navigation.fit ?? CHOICE_LIMIT) - (objection ? 1 : 0) - (help ? 1 : 0) - dial(frame.decision, rules).filter((route) => !walked.includes(route.id)).length;
				const menu = inspect(decisionChoices(shown), navigation.selected, capacity);
				const whole = focus(shown, options.intent, {
					...(seated?.briefs[frame.seat] ? { brief: seated.briefs[frame.seat] } : {}),
					...(seated ? { recaps: seated.recaps } : {}),
					...(rules ? { rules } : {}),
					...(learned.length ? { learned } : {}),
					inspection: navigation.selected, capacity,
				});
				// A route already followed is not offered again. Its answer is
				// already in front of the seat, and offering it twice spends the
				// budget on something the seat has read.
				const packet = { ...whole, ...(objection ? { objection } : {}), routes: whole.routes.filter((route) => !walked.includes(route.id)) };
				const ask = question(packet, help, planned ? { by: "plan", placement: planned.placement, ...(planned.aim ? { aim: planned.aim } : {}), kept: planned.kept } : order.length ? { by: "pilot", placement: [...order].reverse().map((one) => one.name) } : undefined);
				asked += 1;
				options.onAsk?.(packet);
				let answers;
				try {
					answers = await options.api.ask({
						state: asState(compact(packet as unknown as Record<string, unknown>)),
						questions: { [KEY]: ask },
					}, "pick");
				} catch (error) {
					// Too long for the classifier: ask the same decision in smaller inspection steps. Nothing is cut.
					if (!(error instanceof RequestTooLarge) || menu.options.length <= FIT_FLOOR) throw error;
					navigation.fit = Math.max(FIT_FLOOR, Math.floor(menu.options.length / 2));
					continue;
				}

				const answer = chose(answers, KEY);
				if (typeof answer === "string") {
					// Returned to the loop unchanged. It owns the retry and the
					// fallback accounting, and replacing this with the first option
					// would lose the difference between a choice and a fallback.
					options.onGap(`${options.name} via ${options.api.named}: ${answer}`);
					return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
				}
				if (objection && answer.choice === objection.id) return { kind: "object", row: objection.row, claim: objection.claim };
				if (Object.hasOwn(menu.enter, answer.choice)) {
					navigation.selected = menu.enter[answer.choice]!;
					continue;
				}
				if (answer.choice === HELP && help) {
					helped = frame.version;
					return { kind: "work", tools: [{ do: "plan.request", reason: helpRequest(frame, packet) }],
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
			remember(frame);
			if (preparation && frame.version < preparation.from.version) cancel();
			begin(frame);
		},
		reset() { cancel(); accepted = undefined; began = undefined; navigation = undefined; unreviewed = undefined; helped = undefined; },
		close() { closed = true; return cancel()?.then(() => {}); },
	};
}
