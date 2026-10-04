/**
 * Where a seat is in its plan, read from its frame: which steps are due and
 * which listed options fit them, which standing branches apply, which stops
 * hold, and which resources are held. docs/PLANS.md.
 *
 * Progress comes from the ledger (`view.done`), never from equipment, so it
 * cannot tear and replay needs nothing new. Everything here reads; the loop
 * decides what to do with it.
 */
import { holds as condition, viewWorld, type Scope } from "./selectors.ts";
import { matches, select } from "./query.ts";
import { procedureOptions, type ProcedureOption } from "./procedures.ts";
import type { Plan, PlanOption, Procedure } from "./language.ts";
import type { Frame, Option } from "./types.ts";
import type { SeenObject } from "./work.ts";
import type { LedgerRow } from "./table.ts";

/** A step or branch that applies now, and the listed options that fit it. */
export type Fit = { at: number; label: string; candidates: Option[] };
export type PlanState = {
	/** The equipment revision that accepted this plan. */
	revision: number;
	plan: Plan;
	/** Steps due now, in plan order: their window is open and their `if` holds. The next is the first with a fitting option; one with none is passed over. */
	due: Fit[];
	/** Steps not yet taken and not due now, in plan order. */
	waiting: { at: number; label: string }[];
	branches: Fit[];
	/** `askWhen` labels that hold now. */
	stops: string[];
	/** Unarmed stops that are false now, and so arm. */
	arming: string[];
	held: { purpose: string; objects: SeenObject[] }[];
	/** The announcements due steps and branches offer, beside the table's own options. */
	procedures: ProcedureOption[];
};

/** Ledger rows record which step or branch an action carried out. */
export type Execution = NonNullable<LedgerRow["execution"]>;

function candidates(option: PlanOption, frame: Frame, prefix: string): { options: Option[]; procedures: ProcedureOption[] } {
	const { action } = option;
	if ("procedure" in action) {
		const procedures = procedureOptions(action.procedure as Procedure, frame, prefix);
		return { options: procedures.map((choice) => choice.option), procedures };
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
	const work = frame.view.work, plan = work?.plan;
	if (!work || !plan || work.planned === undefined) return null;
	const revision = work.planned;
	const scope: Scope = { world: viewWorld(frame.view), controller: frame.seat };
	const done = new Set(frame.view.done ?? []);
	const open = (option: PlanOption) => matches(option.when, frame) && (!option.if || condition(scope, option.if));
	const procedures: ProcedureOption[] = [];
	const fit = (option: PlanOption, at: number, kind: "s" | "b"): Fit => {
		const found = candidates(option, frame, `plan:${revision}:${kind}${at}`);
		procedures.push(...found.procedures);
		return { at, label: option.label, candidates: found.options };
	};
	const due: Fit[] = [], waiting: PlanState["waiting"] = [];
	plan.steps.forEach((step, at) => {
		if (done.has(at)) return;
		if (open(step)) due.push(fit(step, at, "s"));
		else waiting.push({ at, label: step.label });
	});
	const branches = (plan.may ?? []).flatMap((branch, at) => open(branch) ? [fit(branch, at, "b")] : []).filter((one) => one.candidates.length);
	return {
		revision, plan, due, waiting, branches, procedures,
		stops: (plan.askWhen ?? []).filter((stop) => !work.unarmed?.includes(stop.label) && (!stop.when || matches(stop.when, frame)) && condition(scope, stop.if)).map((stop) => stop.label),
		arming: (plan.askWhen ?? []).filter((stop) => work.unarmed?.includes(stop.label) && ((stop.when && !matches(stop.when, frame)) || !condition(scope, stop.if))).map((stop) => stop.label),
		held: (plan.holds ?? []).filter((hold) => !hold.releaseWhen || !condition(scope, hold.releaseWhen))
			.map((hold) => ({ purpose: hold.purpose, objects: select(hold.objects, frame) })).filter((hold) => hold.objects.length),
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

/**
 * Every option the seat can take, marked with what the plan says about it:
 * the step or branch it carries out, and any held resource it spends. A mark
 * guides; nothing is removed.
 */
export function annotate(options: Option[], state: PlanState): Option[] {
	return [...options, ...state.procedures.map((choice) => choice.option)].map((option) => {
		const marks: string[] = [];
		const step = state.due.find((one) => one.candidates.some((candidate) => candidate.id === option.id));
		const next = state.due.find((one) => one.candidates.length);
		if (step) marks.push(`Plan step ${step.at + 1}${step === next ? "" : ", out of order"}: ${step.label}.`);
		for (const branch of state.branches) if (branch.candidates.some((candidate) => candidate.id === option.id)) marks.push(`Plan branch: ${branch.label}.`);
		for (const hold of state.held) {
			const spent = hold.objects.filter((object) => option.objects?.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation));
			if (spent.length) marks.push(`Uses ${spent.map((object) => object.card ?? object.id).join(", ")}, held: ${hold.purpose}.`);
		}
		return marks.length ? { ...option, shows: [option.shows, ...marks].filter(Boolean).join(" ") } : option;
	});
}

/**
 * A seat that asked to plan each turn plans once per turn of its own, after it
 * has drawn: no plan accepted since its turn began. Before its first plan it
 * waits for an explicit request.
 */
export function planDue(frame: Frame): boolean {
	const work = frame.view.work, at = frame.view.window;
	// After the untap and the draw: the seat's first priority of its turn, outside the upkeep.
	return !!work?.eachTurn && work.accepted !== undefined && at.kind === "turn" && at.active === frame.seat && !["untap", "upkeep"].includes(at.step) &&
		(!frame.decision || frame.decision.situation === "priority") && work.accepted < (frame.view.began ?? 0);
}

/**
 * Why strategy is being asked now, if it is. Only in a turn window: the opening
 * plan waits until the mulligans are done, so it is written for the hand kept.
 */
export const planReason = (frame: Frame): string | undefined => frame.view.window.kind !== "turn" ? undefined :
	frame.view.work?.request ?? (planDue(frame) ? "Your turn has begun and you have drawn. Plan this turn and the opponent's next turn." : undefined);
