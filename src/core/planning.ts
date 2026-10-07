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
import { currentPlan, matches, select } from "./query.ts";
import { procedureOptions, type ProcedureOption } from "./procedures.ts";
import type { Plan, PlanOption, Procedure } from "./language.ts";
import type { Frame, Option } from "./types.ts";
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
		const procedures = procedureOptions(action.procedure as Procedure, frame, prefix);
		// Ordinary equipment can offer the same announcement under another id.
		// Credit that physical action too, only when all accepted terms, targets
		// and payment match. A card name alone cannot identify its chosen mode.
		const equivalent = (frame.decision?.options ?? []).filter((listed) => listed.use &&
			procedures.some((choice) => isDeepStrictEqual(listed.use, choice.activation)));
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
	const held = (plan.holds ?? []).filter((hold) => !hold.releaseWhen || !condition(scope, hold.releaseWhen))
		.map((hold) => ({ purpose: hold.purpose, objects: select(hold.objects, frame) })).filter((hold) => hold.objects.length);
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
	const belongs = (step: PlanOption) => frame.decision?.situation === "priority" && at.kind === "turn" && !(frame.view.objects ?? []).some((object) => object.zone === "stack") &&
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
		held, attacks,
	};
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
	return [...options, ...state.procedures.map((choice) => choice.option)].map((option) => {
		const marks: string[] = [];
		const step = state.due.find((one) => one.candidates.some((candidate) => candidate.id === option.id));
		if (step) marks.push(`Plan step ${step.at + 1}${laterStep(state, step.at) ? ", out of order" : ""}: ${step.label}.${step.waiting ? " Waiting for the stack to empty." : ""}${state.plan.steps[step.at]!.purpose ? ` Choices: ${state.plan.steps[step.at]!.purpose}` : ""}`);
		for (const branch of state.branches) if (branch.candidates.some((candidate) => candidate.id === option.id)) marks.push(`Plan branch: ${branch.label}.${branch.waiting ? " Waiting for the stack to empty." : ""}${state.plan.may![branch.at]!.purpose ? ` Choices: ${state.plan.may![branch.at]!.purpose}` : ""}`);
		for (const hold of state.held) {
			const used = hold.objects.filter((object) => spent(option).some((ref) => ref.id === object.id && ref.incarnation === object.incarnation));
			if (used.length) marks.push(`Uses ${used.map((object) => object.card ?? object.token?.name ?? object.id).join(", ")}, held: ${hold.purpose}.`);
		}
		if (option.use) {
			const { cost, source, funding } = option.use;
			const taps = [...(funding ?? []).map((one) => one.source), ...(cost.tapped ?? []), ...(cost.tap ? [source] : [])];
			for (const attack of state.attacks) for (const object of attack.objects) if (taps.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation))
				marks.push(`This payment taps ${object.card ?? object.token?.name ?? object.id}, named by the remaining attack step "${attack.label}". It would need to untap before attacking.`);
		}
		return marks.length ? { ...option, notes: [...(option.notes ?? []), ...marks], shows: [option.shows, ...marks].filter(Boolean).join(" ") } : option;
	});
}

/**
 * A seat that asked to plan each turn plans once per turn of its own, after it
 * has drawn: no plan accepted since its turn began, including its first turn.
 */
export function planDue(frame: Frame): boolean {
	const work = frame.view.work, at = frame.view.window;
	// After the untap and the draw: the seat's first priority of its turn, outside the upkeep.
	return !!work?.eachTurn && at.kind === "turn" && at.active === frame.seat && !["untap", "upkeep"].includes(at.step) &&
		(!frame.decision || frame.decision.situation === "priority") && (work.accepted === undefined || work.accepted < (frame.view.drawnAt ?? frame.view.began ?? 0));
}

/**
 * Why strategy is being asked now, if it is. Only in a turn window: the opening
 * plan waits until the mulligans are done, so it is written for the hand kept.
 */
export const planReason = (frame: Frame): string | undefined => frame.view.window.kind !== "turn" ? undefined :
	frame.view.work?.request ?? (planDue(frame) ? "Your turn has begun and you have drawn. Plan this turn and the opponent's next turn." : undefined);
