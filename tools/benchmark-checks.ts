/** Narrow saved-position checks. Text matches flag wording, not the truth of arbitrary prose. */
import type { Plan, PlanOption } from "../src/core/language.ts";
import type { Frame } from "../src/core/types.ts";
import { select } from "../src/core/query.ts";

export type Property = { id?: string; source?: string; timing?: string; target?: string; prefix?: string; zone?: string };
export type PlanCheck = { expect?: Property; forbid?: Property; order?: Property[]; forbidProse?: string[] };

export function planText(plan: Plan): string {
	return [plan.objective, plan.guidance, ...(plan.phases ?? []).flatMap((one) => [one.goal, one.guidance, one.reevaluate]),
		...plan.steps.flatMap((one) => [one.label, one.purpose]), ...(plan.may ?? []).flatMap((one) => [one.label, one.purpose]),
		...(plan.holds ?? []).map((one) => one.purpose)].filter(Boolean).join("\n");
}

export function checkPlan(plan: Plan, check: PlanCheck, frame: Frame) {
	const fits = (action: PlanOption["action"], property: Property) => "procedure" in action
		? (!property.source || action.procedure.source.card === property.source) && (!property.zone || action.procedure.source.zones?.some((zone) => zone === property.zone)) && (!property.timing || action.procedure.timing === property.timing) && !property.prefix && !property.id
		: (!property.source || action.objects?.card === property.source || !!action.objects && select(action.objects, frame).some((object) => object.card === property.source)) &&
			(!property.zone || !!action.objects && select(action.objects, frame).some((object) => object.zone === property.zone && (!property.source || object.card === property.source))) &&
			(!property.prefix || action.prefix === property.prefix) && (!property.id || action.option === property.id) && !property.timing;
	const index = (property: Property) => plan.steps.findIndex((step) => fits(step.action, property));
	const ordered = check.order?.map(index) ?? [];
	const structure = (!check.expect || index(check.expect) >= 0) && (!check.forbid || index(check.forbid) < 0) &&
		ordered.every((at, n) => at >= 0 && (!n || at > ordered[n - 1]!));
	const prose = (check.forbidProse ?? []).flatMap((pattern) => {
		const matches = [...planText(plan).matchAll(new RegExp(pattern, "gi"))].map((one) => one[0]);
		return matches.length ? [{ pattern, matches }] : [];
	});
	return { structure, prose, passed: structure && !prose.length };
}
