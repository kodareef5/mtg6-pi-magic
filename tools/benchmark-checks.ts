/** Narrow saved-position checks. Text matches flag wording, not the truth of arbitrary prose. */
import type { Plan, PlanOption } from "../src/core/language.ts";
import type { Frame } from "../src/core/types.ts";
import { select } from "../src/core/query.ts";

export type Property = { id?: string; source?: string; timing?: string; target?: string; prefix?: string; zone?: string; step?: string; mana?: string };
export type PlanCheck = { expect?: Property; require?: Property[]; forbid?: Property; order?: Property[]; anyOrder?: Property[][]; forbidProse?: string[];
	requireHold?: boolean; requireOpponentResponse?: boolean };

/** Physical fixture goals, graded only after the requested continuation finishes. */
export type After = { id: string; zone: string; incarnation?: number };
export function checkPosition(objects: Iterable<{ id: string; zone: string; incarnation: number }>, expected: After[], completed: boolean) {
	const observed = new Map([...objects].map((one) => [one.id, one]));
	const checks = expected.map((want) => { const actual = observed.get(want.id);
		return { expected: want, actual: actual && { id: actual.id, zone: actual.zone, incarnation: actual.incarnation },
			passed: !!actual && actual.zone === want.zone && (want.incarnation === undefined || actual.incarnation === want.incarnation) };
	});
	return { completed, checks, passed: completed && checks.every((one) => one.passed) };
}

export function planText(plan: Plan): string {
	return [plan.objective, plan.guidance, ...(plan.phases ?? []).flatMap((one) => [one.goal, one.guidance, one.reevaluate]),
		...plan.steps.flatMap((one) => [one.label, one.purpose]), ...(plan.may ?? []).flatMap((one) => [one.label, one.purpose]),
		...(plan.holds ?? []).map((one) => one.purpose)].filter(Boolean).join("\n");
}

export function checkPlan(plan: Plan, check: PlanCheck, frame: Frame) {
	const at = frame.view.window;
	const responseTurn = at.kind === "turn" ? at.turn + Number(at.active === frame.seat) : undefined;
	const plannedTurn = at.kind === "turn" ? at.turn + Number(at.active !== frame.seat) : undefined;
	const fits = (action: PlanOption["action"], property: Property) => "procedure" in action
		? (!property.source || action.procedure.source.card === property.source) && (!property.zone || action.procedure.source.zones?.some((zone) => zone === property.zone)) && (!property.timing || action.procedure.timing === property.timing) && (!property.mana || action.procedure.cost?.mana === property.mana) && !property.prefix && !property.id
		: (!property.source || action.objects?.card === property.source || !!action.objects && select(action.objects, frame).some((object) => object.card === property.source)) &&
			(!property.zone || !!action.objects && select(action.objects, frame).some((object) => object.zone === property.zone && (!property.source || object.card === property.source))) &&
			(!property.prefix || action.prefix === property.prefix) && (!property.id || action.option === property.id) && !property.timing && !property.mana;
	const index = (property: Property) => plan.steps.findIndex((step) => (!property.step || plannedTurn !== undefined && step.when.active === "self" && step.when.step === property.step &&
		(step.when.fromTurn === undefined || step.when.fromTurn <= plannedTurn) && (step.when.throughTurn === undefined || step.when.throughTurn >= plannedTurn)) && fits(step.action, property));
	const ordered = (properties: Property[]) => properties.map(index).every((at, n, all) => at >= 0 && (!n || at > all[n - 1]!));
	const structure = (!check.expect || index(check.expect) >= 0) && (!check.forbid || index(check.forbid) < 0) &&
		(check.require ?? []).every((property) => index(property) >= 0) &&
		(!check.order || ordered(check.order)) && (!check.anyOrder || check.anyOrder.some(ordered)) &&
		(!check.requireHold || !!plan.holds?.length) &&
		(!check.requireOpponentResponse || responseTurn !== undefined && !!plan.phases?.some(({ when }) => when.active === "opponent" && !when.step && !when.phase &&
			(when.fromTurn === undefined || when.fromTurn <= responseTurn) && (when.throughTurn === undefined || when.throughTurn >= responseTurn)));
	const prose = (check.forbidProse ?? []).flatMap((pattern) => {
		const matches = [...planText(plan).matchAll(new RegExp(pattern, "gi"))].map((one) => one[0]);
		return matches.length ? [{ pattern, matches }] : [];
	});
	return { structure, prose, passed: structure && !prose.length };
}
