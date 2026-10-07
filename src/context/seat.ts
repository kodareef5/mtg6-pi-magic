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
 * and the remaining steps with the windows they are scheduled for. With nothing due
 * and an empty stack the question is narrow: act in this window, or keep the line.
 */
export function helpRequest(frame: Frame, packet: Packet): string {
	const at = frame.view.window;
	const where = at.kind === "turn" ? `${at.active === frame.seat ? "your" : "the opponent's"} turn ${at.turn}, ${at.step}` : "the opening";
	const stack = (frame.view.objects ?? []).filter((one) => one.zone === "stack").sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
		.map((one) => one.card ?? one.token?.name ?? "an ability");
	const plan = packet.plan;
	const next = (plan?.next ?? []).map((one) => `${one.label} (${one.status === "condition-false" ? "its condition is false now"
		: one.scheduled ? `${one.scheduled.step}${at.kind === "turn" && one.scheduled.turn !== at.turn ? ` of turn ${one.scheduled.turn}` : ""}` : "no window left this turn"})`);
	const blocked = (packet.checklist ?? []).filter((one) => one.kind !== "phase" && ["unavailable", "waiting"].includes(one.status))
		.map((one) => `${one.label} (${one.status})`);
	return [`The pilot asked for help at ${where}: ${frame.decision?.question ?? ""}`,
		...(plan?.due ? [`Due step: ${plan.due}.`] : []),
		...(blocked.length ? [`Unfinished in this window: ${blocked.join("; ")}.`] : []),
		stack.length ? `On the stack: ${stack.join(", ")}.` : "The stack is empty.",
		next.length ? `Later planned steps: ${next.join("; ")}.` : "No later step is planned this turn.",
		!plan?.due && !stack.length && !blocked.length ? "Nothing is due in this window. Decide whether an action belongs here; if not, submit only the assessment to keep the line and the pilot continues it."
			: "Review the conflict with the current position and repair the unfinished line."].join(" ");
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
	const instruction = packet.resolution?.program[0]?.instruction;
	const search = instruction?.do === "choose" && instruction.from.zones?.length === 1 && instruction.from.zones[0] === "library" &&
		!instruction.from.is && !instruction.from.linked && packet.resolution?.program.some((one) => one.instruction.do === "shuffle" && one.instruction.who === instruction.who);
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
		...(search ? ["The accepted search is already being carried out. Choose a listed card that fulfills its instruction and recorded purpose. Failing to find is a deliberate exception requiring a prepared reason, not a way to pass or postpone the paid action. If no eligible card remains, finish the search.",
			...(help ? ["If an uncovered change requires failing to find, ask for help."] : [])] : []),
		...(packet.objects.some((one) => one.zone === "stack") && !packet.resolving ? ["The stack is waiting. Land plays and uses at sorcery speed need an empty stack. Their absence alone does not require a new plan. Apply the prepared response policy now. Passing lets the top object resolve after every seat passes; it does not end the phase or guarantee a later use will become available.",
			"Read named stack targets and order before responding. An effect already pending on a target has not resolved; paying again starts another use."] : []),
		...(packet.plan ? ["Follow the step's Choices and applicable phase policies. A hold needs its release policy; if it contradicts a chosen payment, request help rather than inventing precedence. script.completion applies after this window's commitments finish; absence or an empty list grants no pass. Waiting uses the response policy."] : []),
		...(packet.plan?.next.length ? ["plan.next names unfinished actions outside the current window or with a false condition. Read when beside each label. scheduled, when present, is the first matching window currently scheduled later this turn; it does not promise that conditions, sources or actions will be available there. A main-phase cast cannot happen during upkeep or draw; use the current response policy and choose the passes needed to reach its window. An unrelated available activation is not a substitute for that later action and may spend its mana. Ask for help if an uncovered event requires changing the line."] : []),
		...(packet.checklist?.length ? ["checklist describes the plan now: available means a listed use; later means after an earlier commitment; waiting means the use or its chosen prerequisite requires an empty stack; condition-false means its stated condition is false; unavailable means no current option. None completes a step or grants a pass. recorded means the phase's explicit steps are in the ledger, not that its goal is guaranteed. Follow the order and prepared response policies; do not optimize a new line.",
			"Before choosing a pass or declaration ending, check remaining actions against the phase guidance. Confirm that no planned action is required now. A pending effect can require waiting. An unavailable required line or an uncovered change needs help; silence in the plan alone is not a passing policy."] : []),
		...(packet.checklist?.some((one) => one.status === "policy") ? ["policy means this window's phase guidance has no explicit step or branch bindings. Its prose can still require an action. The row lists no executable options and credits no action. It neither grants nor withholds a pass; authored completion applies as written."] : []),
		...(help ? ["Ask for help when the position contradicts the line and no prepared alternative covers it. Explain the conflict through the supplied use, targets, payments and remaining work; do not invent a strategy."] : []),
		...(packet.blockDeclaration ? ["blockDeclaration records the completed assignment and its row. Its current characteristics and conflict hints do not establish legality at declaration time."] : []),
		...(packet.routes.length ? ["Rule asks show the named rule and return to this decision without acting."] : []),
		...(packet.learned?.length ? ["learned contains the cited rules you asked to see; they are reference text, not actions."] : []),
		...(packet.refused?.length ? ["refused explains the previous unusable answer. The physical decision is unchanged."] : []),
	].join("\n");
	return { type: "choice", instructions, criteria: Object.fromEntries([
		...packet.options.map((option) => [option.id, ["pass", "attack:done", "block:done"].includes(option.id) && packet.checklist?.length
			? `Confirm the plan's current completion or waiting conditions, then choose ${option.label}. This records the physical choice, not completion of any unperformed step.`
			: `Select the option with this id: ${option.label}. Read its bindings, payment and notes in options.`]),
		...(packet.objection ? [[packet.objection.id, `Ask the judge whether action ${packet.objection.row} declared legal blocks. The judge reconstructs declaration-time evidence and may let it stand or roll back. This choice takes no physical action and does not revise strategy.`]] : []),
		...packet.routes.map((route) => [route.id, `Ask to see ${route.does}. Acts on nothing.`]),
		...(help ? [[HELP, "Request a revision of the unfinished line. Moves nothing."]] : []),
	]) };
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
	let helped: number | undefined;
	let preparation: { turn: number; from: Frame; controller: AbortController; plan: Promise<Prepared | undefined>; ready?: true; timing: PreparationTiming } | undefined;
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
						await cancel();
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
			const help = !!options.plan && !!frame.view.work && helped !== frame.version && !frame.refused?.some((why) => why.includes("requests for a new plan are spent"));

			for (;;) {
				const rules = options.rules && walked.length < budget ? options.rules : undefined;
				const declaration = frame.view.blockDeclaration;
				const objection = options.judge && declaration && declaration.seat !== frame.seat && declaration.blockers.length && !declaration.heard
					? { id: `object:block:${declaration.row}`, row: declaration.row, claim: `Check whether the complete blocking assignment at action ${declaration.row} satisfies declaration-time blocking restrictions.` } : undefined;
				const capacity = CHOICE_LIMIT - (objection ? 1 : 0) - (help ? 1 : 0) - dial(frame.decision, rules).filter((route) => !walked.includes(route.id)).length;
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
				const packet = { ...whole, ...(objection ? { objection } : {}), routes: whole.routes.filter((route) => !walked.includes(route.id)) };
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
