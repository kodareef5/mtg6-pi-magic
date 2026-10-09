/**
 * Where a seat is in its plan, read from its frame: which steps are due and
 * which listed options fit them, which standing branches apply, which stops
 * hold, and which resources are held. docs/PLANS.md.
 *
 * Progress comes from the ledger (`view.done`), never from equipment, so it
 * cannot tear and replay needs nothing new. Everything here reads; the loop
 * decides what to do with it.
 * Past 150 lines to keep matching, resource marks and execution credit together.
 */
import { holds as condition, viewWorld, type Scope } from "./selectors.ts";
import { currentPlan, matches, reached, select } from "./query.ts";
import { procedureOptions, type ProcedureOption } from "./procedures.ts";
import type { Plan, PlanOption, Procedure } from "./language.ts";
import type { Frame, Option, SeatId } from "./types.ts";
import type { SeenObject } from "./work.ts";
import type { LedgerRow } from "./table.ts";
import { isDeepStrictEqual } from "node:util";

/** A step or branch that applies now, and the listed options that fit it. */
export type Fit = { at: number; label: string; candidates: Option[]; waiting?: true };
export type PlanState = {
	/** The equipment revision that accepted this plan. */
	revision: number;
	plan: Plan;
	/** Steps whose window and condition hold, in order. An explicit stack wait keeps later steps later even when no option fits yet. */
	due: Fit[];
	/** Steps not yet taken and not due now, in plan order. */
	waiting: { at: number; label: string }[];
	branches: Fit[];
	/** `askWhen` labels that hold now, and an essential step that should be taken here and cannot. */
	stops: string[];
	/** An essential step due before every step that can be taken now: the table does not take a later step for the seat past it. */
	unmet?: number;
	/** Unarmed stops that are false now, and so arm. */
	arming: string[];
	held: { purpose: string; objects: SeenObject[] }[];
	/** Trigger orders whose window is open, with each listed source and target resolved to what it names now. */
	triggers: { sources: SeenObject[][]; targets: { source: SeenObject[]; target: SeenObject[] | { player: SeatId } }[]; purpose?: string }[];
	/** Current sources named by unfinished attacks in this turn's remaining combat. */
	attacks: { label: string; objects: SeenObject[] }[];
	/** The announcements due steps and branches offer, beside the table's own options. */
	procedures: ProcedureOption[];
};

/** Ledger rows record which step or branch an action carried out. */
export type Execution = NonNullable<LedgerRow["execution"]>;

/** Holds concern resources paid or tapped, not every source or target a choice mentions. */
function spent(option: Option) {
	const use = option.use;
	if (!use) return option.spends ?? [];
	const cost = use.cost;
	return [...(use.timing === "spell" || use.timing === "land" || cost.tap || cost.counters ? [use.source] : []),
		...(use.funding ?? []).map((one) => one.source), ...(cost.tapped ?? []), ...(cost.sacrificed ?? []),
		...(cost.exiled ?? []), ...(cost.discarded ?? [])];
}

function candidates(option: PlanOption, frame: Frame, prefix: string): { options: Option[]; procedures: ProcedureOption[] } {
	const { action } = option;
	if ("procedure" in action) {
		const offered = procedureOptions(action.procedure as Procedure, frame, prefix);
		// Ordinary equipment can offer the same announcement under another id.
		// That listed option carries out the step when all accepted terms, targets
		// and payment match; a card name alone cannot identify its chosen mode.
		// The plan adds its own id only for an announcement nothing listed makes,
		// so one physical action is offered once.
		const listed = (frame.decision?.options ?? []).filter((one) => one.use);
		const equivalent = listed.filter((one) => offered.some((choice) => isDeepStrictEqual(one.use, choice.activation)));
		const procedures = offered.filter((choice) => !listed.some((one) => isDeepStrictEqual(one.use, choice.activation)));
		return { options: [...procedures.map((choice) => choice.option), ...equivalent], procedures };
	}
	const objects = action.objects ? select(action.objects, frame) : null;
	// A step that names only objects means playing them: it is not a discard, a resolution choice or a trigger that happens to name the same card.
	if (!action.option && !action.prefix && frame.decision?.situation !== "priority") return { procedures: [], options: [] };
	return { procedures: [], options: (frame.decision?.options ?? []).filter((listed) =>
		(!action.option || listed.id === action.option) && (!action.prefix || listed.id.startsWith(action.prefix)) &&
		(!objects || objects.some((object) => listed.objects?.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation)))) };
}

/** The seat's plan as it stands at this frame, or null without one. */
export function planState(frame: Frame): PlanState | null {
	const work = frame.view.work, plan = currentPlan(frame);
	if (!work || !plan || work.planned === undefined) return null;
	const revision = work.planned;
	const scope: Scope = { world: viewWorld(frame.view), controller: frame.seat };
	const done = new Set(frame.view.done ?? []);
	const open = (option: PlanOption) => matches(option.when, frame) && (!option.if || condition(scope, option.if));
	const procedures: ProcedureOption[] = [];
	const held = (plan.holds ?? []).filter((hold) => (!hold.releaseWhen || !condition(scope, hold.releaseWhen)) && (!hold.releaseAt || !reached(hold.releaseAt, frame)))
		.map((hold) => ({ purpose: hold.purpose, objects: select(hold.objects, frame) })).filter((hold) => hold.objects.length);
	const opponent = frame.view.players?.find((one) => one.id !== frame.seat)?.id;
	const triggers = (plan.triggers ?? []).filter((one) => !one.when || matches(one.when, frame))
		.map((one) => ({ sources: one.resolve.map((query) => select(query, frame)),
			targets: (one.targets ?? []).flatMap((aim): PlanState["triggers"][number]["targets"] => aim.target === "self" ? [{ source: select(aim.source, frame), target: { player: frame.seat } }]
				: aim.target === "opponent" ? opponent === undefined ? [] : [{ source: select(aim.source, frame), target: { player: opponent } }]
				: [{ source: select(aim.source, frame), target: select(aim.target, frame) }]),
			...(one.purpose ? { purpose: one.purpose } : {}) }));
	const fit = (option: PlanOption, at: number, kind: "s" | "b"): Fit => {
		const found = candidates(option, frame, `plan:${revision}:${kind}${at}`);
		procedures.push(...found.procedures);
		// Holds warn about spending; they cannot change which action was carried out.
		return { at, label: option.label, candidates: found.options,
			...(option.waitFor === "empty-stack" && frame.view.objects?.some((one) => one.zone === "stack") ? { waiting: true as const } : {}) };
	};
	const due: Fit[] = [], waiting: PlanState["waiting"] = [];
	plan.steps.forEach((step, at) => {
		if (done.has(at)) return;
		if (open(step)) due.push(fit(step, at, "s"));
		else waiting.push({ at, label: step.label });
	});
	const branches = (plan.may ?? []).flatMap((branch, at) => open(branch) ? [fit(branch, at, "b")] : []).filter((one) => one.candidates.length || one.waiting);
	// An essential step with nothing listed for it, at a priority where it belongs: in its own step, or with no step named in a main phase.
	// Only with an empty stack: while a spell waits to resolve, passing so it can is the procedure, not a failed line.
	const at = frame.view.window;
	// Attacks and blocks are taken only in their declaration, never at a priority, so a priority cannot find one missing.
	const declares = (step: PlanOption) => !("procedure" in step.action) && /^(attack|block):/.test(step.action.prefix ?? step.action.option ?? "");
	const belongs = (step: PlanOption) => frame.decision?.situation === "priority" && at.kind === "turn" && !(frame.view.objects ?? []).some((object) => object.zone === "stack") && !declares(step) &&
		(step.when.step ? step.when.step === at.step : at.step === "precombat-main" || at.step === "postcombat-main");
	// Only the first essential step with nothing listed, and only before any step that can still be taken: a land step first may yet pay for it.
	const next = due.find((one) => one.candidates.length);
	const unmet = due.find((one) => plan.steps[one.at]!.essential && !one.candidates.length && (!next || one.at < next.at) && belongs(plan.steps[one.at]!));
	const blocked = unmet ? [`Step ${unmet.at + 1} cannot be taken now: ${unmet.label}`] : [];
	const combat = at.kind === "turn" && at.active === frame.seat && (at.step === "declare-attackers" || frame.view.remainingSteps?.includes("declare-attackers"))
		? { ...frame, view: { ...frame.view, window: { ...at, step: "declare-attackers", phase: "combat" } } } as Frame : undefined;
	const attacks = combat ? plan.steps.flatMap((step, index) => {
		const action = step.action;
		if (done.has(index) || !matches(step.when, combat) || "procedure" in action || action.prefix !== "attack:" || !action.objects || step.if && !condition(scope, step.if)) return [];
		return [{ label: step.label, objects: select(action.objects, frame).filter((one) => one.zone === "battlefield" && one.controller === frame.seat) }];
	}) : [];
	return {
		revision, plan, due, waiting, branches, procedures, ...(unmet ? { unmet: unmet.at } : {}),
		stops: [...(plan.askWhen ?? []).filter((stop) => !work.unarmed?.includes(stop.label) && (!stop.when || matches(stop.when, frame)) && condition(scope, stop.if)).map((stop) => stop.label), ...blocked],
		arming: (plan.askWhen ?? []).filter((stop) => work.unarmed?.includes(stop.label) && ((stop.when && !matches(stop.when, frame)) || !condition(scope, stop.if))).map((stop) => stop.label),
		held, triggers, attacks,
	};
}

const same = (a: { id: string; incarnation: number }, b: { id: string; incarnation: number }) => a.id === b.id && a.incarnation === b.incarnation;
/** Whether a trigger option aims where the policy names its source's target, or undefined when the policy names none. */
function aims(policy: PlanState["triggers"][number], option: Option): boolean | undefined {
	const source = option.objects?.[0], rules = policy.targets.filter((aim) => source && aim.source.some((object) => same(object, source)));
	if (!option.trigger || !rules.length) return undefined;
	return rules.some((aim) => option.trigger!.targets.some((chosen) => "player" in aim.target
		? "player" in chosen && chosen.player === (aim.target as { player: SeatId }).player
		: !("player" in chosen) && (aim.target as SeenObject[]).some((object) => same(object, chosen))));
}

/**
 * The plan's order for the waiting triggers these options put on: the triggers that go on the stack now and the
 * order they all go on in, last to resolve first. The first open policy that orders two or more of them applies.
 */
export function triggerOrder(state: PlanState, options: readonly Option[]): { now: string[]; placement: string[]; purpose?: string; aimed: (option: Option) => boolean; kept: boolean } | undefined {
	const waiting = [...new Map(options.flatMap((one) => one.trigger && one.objects?.[0] ? [[one.trigger.id, { ...one.trigger, source: one.objects[0] }] as const] : [])).values()];
	for (const policy of state.triggers) {
		const ranked = waiting.map((one) => ({ one, rank: policy.sources.findIndex((objects) => objects.some((object) => object.id === one.source.id && object.incarnation === one.source.incarnation)) }))
			.filter((one) => one.rank >= 0);
		if (new Set(ranked.map((one) => one.rank)).size < 2) continue;
		const last = Math.max(...ranked.map((one) => one.rank));
		// A named target narrows the options that keep the order to those aiming at it; a trigger with none named keeps it with any target.
		const aimed = (option: Option) => aims(policy, option) !== false;
		const now = ranked.filter((one) => one.rank === last).map((one) => one.one.id);
		return { now, placement: [...ranked].sort((a, b) => b.rank - a.rank).map((one) => one.one.name),
			...(policy.purpose ? { purpose: policy.purpose } : {}), aimed, kept: options.some((option) => option.trigger && now.includes(option.trigger.id) && aimed(option)) };
	}
}

/** The first due step an option carries out, or else a branch it carries out. Neither means it is off the plan. */
export function execution(state: PlanState, id: string): Execution | undefined {
	const fits = (one: Fit) => one.candidates.some((option) => option.id === id);
	const step = state.due.find(fits);
	if (step) return { plan: state.revision, step: step.at };
	const branch = state.branches.find(fits);
	return branch ? { plan: state.revision, branch: branch.at } : undefined;
}

/** Attack choices in one declaration form a set; finishing the declaration still follows them. */
export function laterStep(state: PlanState, at: number): boolean {
	const next = state.due.find((one) => one.candidates.length || one.waiting);
	if (!next || at <= next.at) return false;
	if (next.waiting) return true;
	const attack = (index: number) => {
		const action = state.plan.steps[index]!.action;
		return !("procedure" in action) && (action.prefix === "attack:" || !!action.option?.startsWith("attack:") && action.option !== "attack:done");
	};
	return !(attack(at) && state.due.filter((one) => one.at >= next.at && one.at <= at).every((one) => attack(one.at)));
}

/**
 * Every option the seat can take, marked with what the plan says about it:
 * the step or branch it carries out, and any held resource it spends. A mark
 * guides; nothing is removed.
 */
export function annotate(options: Option[], state: PlanState): Option[] {
	const order = triggerOrder(state, options);
	return [...options, ...state.procedures.map((choice) => choice.option)].map((option) => {
		const marks: string[] = [];
		// Stated in placement order: the trigger named first is the one that goes on now.
		if (order && option.trigger && order.now.includes(option.trigger.id) && order.aimed(option))
			marks.push(`Your plan's trigger order puts this trigger on the stack now: ${order.placement.map((name, at) => at ? name : `${name} now`).join(", then ")}.${order.purpose ? ` Choices: ${order.purpose}` : ""}`);
		// A named target counts whenever its trigger waits, alone included, unless the order puts that trigger on later.
		else if (option.trigger && (!order || order.now.includes(option.trigger.id)) && state.triggers.some((policy) => aims(policy, option)))
			marks.push("Aims where your plan's trigger targets name this trigger's target.");
		const step = state.due.find((one) => one.candidates.some((candidate) => candidate.id === option.id));
		if (step) marks.push(`Plan step ${step.at + 1}${laterStep(state, step.at) ? ", out of order" : ""}: ${step.label}.${step.waiting ? " Waiting for the stack to empty." : ""}${state.plan.steps[step.at]!.purpose ? ` Choices: ${state.plan.steps[step.at]!.purpose}` : ""}`);
		if (option.id === "attack:done") {
			const unfinished = state.due.flatMap((one) => {
				if (one.candidates.some((candidate) => candidate.id === option.id)) return [];
				const attacks = one.candidates.filter((candidate) => candidate.id.startsWith("attack:"));
				return attacks.length ? [`step ${one.at + 1} (${attacks.map((candidate) => candidate.label).join(" or ")})`] : [];
			});
			if (unfinished.length) marks.push(`Finishing now leaves available plan steps unfinished: ${unfinished.join("; ")}.`);
		}
		for (const branch of state.branches) if (branch.candidates.some((candidate) => candidate.id === option.id)) marks.push(`Plan branch: ${branch.label}.${branch.waiting ? " Waiting for the stack to empty." : ""}${state.plan.may![branch.at]!.purpose ? ` Choices: ${state.plan.may![branch.at]!.purpose}` : ""}`);
		for (const hold of state.held) {
			const used = hold.objects.filter((object) => spent(option).some((ref) => ref.id === object.id && ref.incarnation === object.incarnation));
			if (used.length) marks.push(`Spends ${used.map((object) => `${object.card ?? object.token?.name ?? object.id} (${object.id}@${object.incarnation})`).join(", ")}, which the plan holds for: ${hold.purpose.replace(/\.$/, "")}.`);
		}
		if (option.use) {
			const { cost, source, funding } = option.use;
			const taps = [...(funding ?? []).map((one) => one.source), ...(cost.tapped ?? []), ...(cost.tap ? [source] : [])];
			for (const attack of state.attacks) for (const object of attack.objects) if (taps.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation))
				marks.push(`This payment taps ${object.card ?? object.token?.name ?? object.id}, named by the remaining attack step "${attack.label}". It would need to untap before attacking.`);
		}
		return marks.length ? { ...option, notes: [...(option.notes ?? []), ...marks] } : option;
	});
}

/** Scoped work is accepted before upkeep choices, then reviewed after the draw.
 * Opening and unscoped legacy work retain their first post-draw priority deadline. */
export function planDue(frame: Frame): boolean {
	const work = frame.view.work, at = frame.view.window;
	if (!work?.eachTurn || at.kind !== "turn" || at.active !== frame.seat || at.step === "untap") return false;
	const decision = frame.decision;
	if (decision?.situation === "state-based" && decision.options.length === 1 ||
		decision?.situation === "turn-based" && decision.options.some((one) => one.id === "draw")) return false;
	const scoped = work.plan?.throughTurn !== undefined;
	// Read the recorded plan here: an expired plan still establishes this schedule.
	if (scoped && (work.accepted === undefined || work.accepted < (frame.view.began ?? 0))) return true;
	if (at.step === "upkeep" || at.step === "draw" && frame.view.drawnAt === undefined) return false;
	return (scoped || !frame.decision || frame.decision.situation === "priority") &&
		(work.accepted === undefined || work.accepted < (frame.view.drawnAt ?? frame.view.began ?? 0));
}

/**
 * Why strategy is being asked now, if it is. Only in a turn window: the opening
 * plan waits until the mulligans are done, so it is written for the hand kept.
 */
export function planReason(frame: Frame): string | undefined {
	if (frame.view.window.kind !== "turn") return;
	if (frame.view.work?.request) return frame.view.work.request;
	if (!planDue(frame)) return;
	const accepted = frame.view.work?.accepted;
	if (accepted === undefined || accepted < (frame.view.began ?? 0))
		return "Accept or amend this turn's plan from the current board and your matchup plan. Cover the rest of this turn and the opponent's next turn. Your draw is still unknown.";
	return "Review the unfinished line after this turn's draw; the situation names the card you drew. Keep completed work completed and cover the opponent's next turn.";
}
