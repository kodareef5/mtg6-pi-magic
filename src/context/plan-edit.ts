/** Short writer answers expand to ordinary plans before they reach core. */
import { Type, type Static } from "typebox";
import { PlanDefs, PlanSchema, QuerySchema, problems, type Plan, type PlanOption } from "../core/language.ts";
import type { Frame } from "../core/types.ts";
import { planDue } from "../core/planning.ts";
import type { Lookup } from "./reason.ts";
import { printedCast } from "../core/procedures.ts";
import { matches } from "../core/query.ts";

// Reuse names an action already written by this seat, not a card implementation.
const Action = Type.Union([...PlanDefs.Option.properties.action.anyOf,
	Type.Object({ reuse: Type.String({ minLength: 1 }) }, { additionalProperties: false })]);
const { Plan: planFields, ...definitions } = PlanDefs;
export const ChangesSchema = Type.Cyclic({ ...definitions,
	Option: Type.Object({ ...PlanDefs.Option.properties, action: Action }, { additionalProperties: false }),
	Changes: Type.Object(Object.fromEntries(Object.entries(planFields.properties).map(([key, field]) => [key, Type.Optional(field)])), { additionalProperties: false }),
}, "Changes");

/** A current response has a known window. The model chooses actions, not that metadata. */
export const ResponseSchema = Type.Object({
	current: Type.Array(Type.Object({ label: Type.String({ minLength: 1 }), purpose: Type.Optional(Type.String()),
		action: Type.Union([PlanDefs.Option.properties.action.anyOf[0]!, Type.Object({ reuse: Type.String({ minLength: 1 }) }, { additionalProperties: false })]),
	}, { additionalProperties: false }), { minItems: 1 }),
	guidance: Type.Optional(Type.String()),
	holds: Type.Optional(Type.Array(Type.Object({ objects: QuerySchema, purpose: Type.String({ minLength: 1 }) }, { additionalProperties: false }))),
}, { additionalProperties: false });

/** Replace this window's unfinished steps, preserving the rest of the line. */
export function responseChanges(frame: Frame, base: Plan, changes: unknown) {
	const wrong = problems(ResponseSchema, changes);
	if (wrong.length) throw new Error(`The response does not match its schema: ${wrong.join("; ")}.`);
	const at = frame.view.window;
	if (at.kind !== "turn") throw new Error("A response needs a current turn window.");
	const { current, ...rest } = changes as Static<typeof ResponseSchema>;
	const when = { active: at.active === frame.seat ? "self" as const : "opponent" as const, step: at.step, fromTurn: at.turn, throughTurn: at.turn };
	return { ...rest, steps: [...current.map((one) => ({ ...one, when })), ...base.steps.filter((one) => !matches(one.when, frame))] };
}

/** The actions available to reuse, with readable labels and their complete accepted syntax. */
export function actions(frame: Frame, prepared?: Plan): Record<string, { label: string; action: PlanOption["action"] }> {
	const plan = prepared ?? frame.view.work?.plan;
	return Object.fromEntries([
		...(plan?.steps ?? []).map((one, at) => [`step:${at} ${one.label}`, { label: one.label, action: one.action }]),
		...(plan?.may ?? []).map((one, at) => [`may:${at} ${one.label}`, { label: one.label, action: one.action }]),
		// A historical pick fixed a past incarnation and payment. It is evidence
		// in history, not reusable equipment. Procedures and selectors remain useful.
		...(frame.view.worked ?? []).flatMap((one, at) => "option" in one.action && one.action.option ? []
			: [[`worked:${at} ${one.label}`, { label: one.label, action: one.action }]]),
		...(frame.view.work?.packages ?? []).flatMap((pack) => pack.procedures ?? []).map((procedure, at) => [`prepared:${at} ${procedure.claim}`, { label: procedure.claim, action: { procedure } }]),
		...(frame.view.work?.packages ?? []).filter((pack) => pack.printedCast && frame.view.printed?.[pack.card]).map((pack) =>
			[`printed:${pack.card}`, { label: `Cast ${pack.card} for its printed cost`, action: { procedure: printedCast(pack.card, frame.view.printed![pack.card]!) } }]),
	]);
}

/** Read accepted equipment beyond the current position without changing it or certifying its interpretation. */
export function equipment(frame: Frame, available: ReturnType<typeof actions>): Lookup {
	return { name: "equipment", description: "Read this seat's accepted package and reusable actions for a named card, including registered cards absent from the position. These terms may contain interpretation errors; reading them neither prepares nor uses a card.",
		parameters: { type: "object", properties: { card: { type: "string" } }, required: ["card"], additionalProperties: false },
		answer: ({ card }) => JSON.stringify({ card, package: frame.view.work?.packages?.find((one) => one.card === card),
			actions: Object.fromEntries(Object.entries(available).filter(([, one]) => ("procedure" in one.action ? one.action.procedure.source.card : one.action.objects?.card) === card)) }),
	};
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
