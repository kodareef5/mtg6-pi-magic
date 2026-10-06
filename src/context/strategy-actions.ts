/** The planner chooses uses and resource policy; Jev binds an offered payment. */
import type { Frame, Option } from "../core/types.ts";
import type { actions } from "./plan-edit.ts";

/** Keep accepted instructions intact and make an omitted printed cost explicit. */
export function actionFacts(frame: Frame, available: ReturnType<typeof actions>) {
	return Object.fromEntries(Object.entries(available).map(([key, one]) => {
		if (!("procedure" in one.action)) {
			const offered = frame.decision?.options.find((option) => option.id === ("option" in one.action ? one.action.option : undefined));
			return [key, { ...one, ...(offered?.use ? { fixedUse: offered.use } : {}) }];
		}
		const { cost, ...procedure } = one.action.procedure;
		const card = procedure.source.card;
		const mana = cost?.mana ?? (procedure.timing === "spell" && card ? frame.view.printed?.[card]?.mana : undefined);
		return [key, { ...procedure, cost: { ...cost, mana: mana ?? (procedure.timing === "spell" ? "Read the bound source's printed cost" : "{0}") },
			costBasis: cost?.mana === undefined && procedure.timing === "spell" ? "printed mana cost" : "stated cost" }];
	}));
}

/**
 * Preserve every use, cost and target binding without enumerating payments in
 * the planning question. The pilot still receives every original option id.
 * Equality of accepted terms distinguishes modes; claims alone never merge them.
 */
export function planningChoices(options: readonly Option[]) {
	const uses = new Map<string, { terms: Omit<NonNullable<Option["use"]>, "paid" | "funding" | "targets">; bindings: Map<string, NonNullable<Option["use"]>["targets"]>; payments: number }>();
	for (const option of options) {
		if (!option.use) continue;
		const { paid: _paid, funding: _funding, targets, ...terms } = option.use;
		const key = JSON.stringify(terms);
		const use = uses.get(key) ?? { terms, bindings: new Map(), payments: 0 };
		use.bindings.set(JSON.stringify(targets), targets);
		use.payments += 1;
		uses.set(key, use);
	}
	return { options: options.filter((one) => !one.use), uses: [...uses.values()].map((use) => ({
		...use.terms, targets: [...use.bindings.values()], offeredCombinations: use.payments,
	})) };
}
