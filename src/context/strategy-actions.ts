/** The planner chooses uses and resource policy; Jev binds an offered payment. */
import type { Frame, Option } from "../core/types.ts";
import type { Plan } from "../core/language.ts";
import { matches, select } from "../core/query.ts";
import { sources } from "../core/funding.ts";
import type { actions } from "./plan-edit.ts";

/** Keep accepted instructions intact and make an omitted printed cost explicit. */
export function actionFacts(frame: Frame, available: ReturnType<typeof actions>) {
	return Object.fromEntries(Object.entries(available).map(([key, one]) => {
		if (!("procedure" in one.action)) {
			const offered = frame.decision?.options.find((option) => option.id === ("option" in one.action ? one.action.option : undefined));
			return [key, { ...one, ...(offered?.use ? { fixedUse: offered.use }
				: one.action.option ? { availability: offered ? "Offered now" : "This exact pick is not offered now. Reuse a prepared use for a future cast; old pick ids do not follow zone changes or different payments." } : {}) }];
		}
		const { cost, instructions: _instructions, ...procedure } = one.action.procedure;
		const card = procedure.source.card;
		const mana = cost?.mana ?? (procedure.timing === "spell" && card ? frame.view.printed?.[card]?.mana : undefined);
		return [key, { ...procedure, sourcesNow: select(procedure.source, frame).map((one) => ({ id: one.id, incarnation: one.incarnation, zone: one.zone })),
			cost: { ...cost, mana: mana ?? (procedure.timing === "spell" ? "Read the bound source's printed cost" : "{0}") },
			costBasis: cost?.mana === undefined && procedure.timing === "spell" ? "printed mana cost" : "stated cost" }];
	}));
}

/** The displayed base refers to its reusable actions; executable bodies stay in equipment. */
export function planFacts(plan: Plan) {
	const options = (list: Plan["steps"], kind: string) => list.map((one, at) => ({ ...one, action: { reuse: `${kind}:${at} ${one.label}` } }));
	return { ...plan, steps: options(plan.steps, "step"), ...(plan.may ? { may: options(plan.may, "may") } : {}) };
}

/** Diagnose exact bindings in the old line without treating a future use as illegal. */
export function bindingFacts(frame: Frame, base: Plan) {
	return {
		unoffered: base.steps.flatMap((step, at) => {
			if (!("option" in step.action) || !step.action.option || !matches(step.when, frame)) return [];
			const id = step.action.option;
			return frame.decision?.options.some((one) => one.id === id) ? [] : [{ step: at, label: step.label, option: id,
				fact: "Not offered at this decision. An earlier prerequisite may still enable it, but a stale payment or zone incarnation will not become valid. Use a prepared action for the intended cast." }];
		}),
		holds: (base.holds ?? []).map((hold) => ({ purpose: hold.purpose, selected: select(hold.objects, frame).map((one) => ({ id: one.id, incarnation: one.incarnation, card: one.card })) })),
	};
}

/**
 * Preserve every use, cost and target binding without enumerating payments in
 * the planning question. The pilot still receives every original option id.
 * Equality of accepted terms distinguishes modes; claims alone never merge them.
 */
export function planningChoices(frame: Frame) {
	const options = frame.decision?.options ?? [];
	const manaSources = sources(frame);
	const uses = new Map<string, { terms: Omit<NonNullable<Option["use"]>, "paid" | "funding" | "targets">; bindings: Map<string, NonNullable<Option["use"]>["targets"]>; notes: string[]; payments: number; left: number[] }>();
	for (const option of options) {
		if (!option.use) continue;
		const { paid: _paid, funding, targets, ...terms } = option.use;
		const notes = option.notes ?? [], key = JSON.stringify({ terms, notes });
		const use = uses.get(key) ?? { terms, bindings: new Map(), notes, payments: 0, left: [] as number[] };
		use.bindings.set(JSON.stringify(targets), targets);
		const spent = new Set([...(funding ?? []).map((tap) => tap.source.id), ...(terms.cost.tap ? [terms.source.id] : []),
			...[...(terms.cost.tapped ?? []), ...(terms.cost.sacrificed ?? []), ...(terms.cost.exiled ?? [])].map((ref) => ref.id)]);
		use.left.push(manaSources.filter(({ object }) => !spent.has(object.id)).length);
		use.payments += 1;
		uses.set(key, use);
	}
	return { options: options.filter((one) => !one.use), uses: [...uses.values()].map((use) => {
		const source = frame.view.objects?.find((one) => one.id === use.terms.source.id && one.incarnation === use.terms.source.incarnation);
		const { instructions: _instructions, ...terms } = use.terms;
		return { ...terms, card: source?.card, from: source?.zone, targets: [...use.bindings.values()], notes: [...use.notes],
			manaRequired: use.terms.cost.generic + use.terms.cost.colors.length,
			untappedSourcesAfterPayment: { minimum: Math.min(...use.left), maximum: Math.max(...use.left),
				scope: "Remaining current mana-source objects immediately after paying, before resolution or changes to their abilities. Floating mana is separate." },
			offeredCombinations: use.payments };
	}) };
}
