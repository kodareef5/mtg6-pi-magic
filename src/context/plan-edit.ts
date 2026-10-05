/** Short writer answers expand to ordinary plans before they reach core. */
import { Type } from "typebox";
import { PlanDefs, PlanSchema, problems, type Plan, type PlanOption } from "../core/language.ts";
import type { Frame } from "../core/types.ts";
import { planDue } from "../core/planning.ts";

// Reuse names an action already written by this seat, not a card implementation.
const Action = Type.Union([...PlanDefs.Option.properties.action.anyOf,
	Type.Object({ reuse: Type.String({ pattern: "^(step|may|worked):[0-9]+$" }) }, { additionalProperties: false })]);
const { Plan: planFields, ...definitions } = PlanDefs;
export const ChangesSchema = Type.Cyclic({ ...definitions,
	Option: Type.Object({ ...PlanDefs.Option.properties, action: Action }, { additionalProperties: false }),
	Changes: Type.Object(Object.fromEntries(Object.entries(planFields.properties).map(([key, field]) => [key, Type.Optional(field)])), { additionalProperties: false }),
}, "Changes");

/** The actions available to reuse, with readable labels and their complete accepted syntax. */
export function actions(frame: Frame, prepared?: Plan): Record<string, { label: string; action: PlanOption["action"] }> {
	const plan = prepared ?? frame.view.work?.plan;
	return Object.fromEntries([
		...(plan?.steps ?? []).map((one, at) => [`step:${at}`, { label: one.label, action: one.action }]),
		...(plan?.may ?? []).map((one, at) => [`may:${at}`, { label: one.label, action: one.action }]),
		...(frame.view.worked ?? []).map((one, at) => [`worked:${at}`, { label: one.label, action: one.action }]),
	]);
}

/**
 * Keep strategic defaults; a new turn gets a new ordered line. A midturn edit
 * starts from the unfinished steps, so an unchanged step cannot execute twice.
 * Existing packages live in work and need no repetition in the next answer.
 */
export function basePlan(frame: Frame, prepared?: Plan, nextTurn = false): Plan {
	if (prepared) return structuredClone(prepared);
	const plan = frame.view.work?.plan;
	if (!plan) return { objective: "", guidance: "", steps: [] };
	const at = frame.view.window;
	const fresh = nextTurn || planDue(frame);
	const done = new Set(frame.view.done ?? []);
	const base = structuredClone({ ...plan, steps: fresh ? [] : plan.steps.filter((_, n) => !done.has(n)) });
	delete base.packages;
	if (fresh && at.kind === "turn") {
		const turn = at.active === frame.seat ? at.turn : at.turn + 1;
		// Carry a window's defaults into the new pair of turns. The writer sees
		// this base and changes any default that no longer fits the position.
		for (const one of [...(base.may ?? []), ...(base.phases ?? []), ...(base.askWhen ?? [])]) {
			const when = one.when;
			if (!when || when.fromTurn === undefined || when.throughTurn === undefined) continue;
			const start = when.active === "opponent" ? turn + 1 : turn;
			const width = when.throughTurn - when.fromTurn;
			when.fromTurn = start;
			when.throughTurn = start + width;
		}
	}
	return base;
}

/** Merge changed fields and expand reused actions. This never writes private or physical state. */
export function changedPlan(base: Plan, changes: unknown, available: ReturnType<typeof actions>): Plan {
	const wrong = problems(ChangesSchema, changes);
	if (wrong.length) throw new Error(`changes does not match the schema: ${wrong.join("; ")}.`);
	const plan = structuredClone({ ...base, ...changes as Partial<Plan> });
	// Preparation's packages have not reached work yet. An amendment adding a
	// new permanent must keep those pending packages as well as accepted ones.
	const added = (changes as Partial<Plan>).packages;
	if (added) plan.packages = [...(base.packages ?? []).filter((one) => !added.some((next) => next.card === one.card)), ...structuredClone(added)];
	for (const one of [...plan.steps, ...(plan.may ?? [])]) {
		if (!("reuse" in one.action)) continue;
		const key = one.action.reuse as string, found = available[key];
		if (!found) throw new Error(`No reusable action ${JSON.stringify(key)}. Use a key under actions, or write the action.`);
		one.action = structuredClone(found.action);
	}
	const shape = problems(PlanSchema, plan);
	if (shape.length) throw new Error(`The resulting plan does not match the schema: ${shape.join("; ")}.`);
	return plan;
}
