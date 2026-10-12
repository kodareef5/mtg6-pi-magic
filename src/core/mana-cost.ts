/** Mana symbols describe costs, not a payment or a spell's colors (107.4, 601.2b).
 * Hybrid choices become ordinary costs before targets, reductions and funding.
 * Phyrexian and snow symbols still require machinery this parser does not offer. */
import type { Mana } from "./table.ts";

export type ManaCost = { generic: number; colors: Mana["color"][]; x: number };
export const MANA_PATTERN = "^(\\{([0-9]+|[WUBRGCX]|[WUBRGC]/[WUBRGC]|2/[WUBRG])\\})+$";

/** Distinct nonhybrid equivalents. Choosing U/B then B/U does not duplicate UB. */
export function manaChoices(text: string): ManaCost[] | undefined {
	const parts = text.match(/\{[^}]+\}/g) ?? [];
	if (parts.join("") !== text || text && !new RegExp(MANA_PATTERN).test(text)) return undefined;
	let choices: ManaCost[] = [{ generic: 0, colors: [], x: 0 }];
	for (const part of parts) {
		const alternatives = part.slice(1, -1).split("/");
		choices = choices.flatMap(cost => alternatives.map(symbol => /^\d+$/.test(symbol)
			? { ...cost, generic: cost.generic + Number(symbol) }
			: symbol === "X" ? { ...cost, x: cost.x + 1 }
			: { ...cost, colors: [...cost.colors, symbol as Mana["color"]] }));
		choices = [...new Map(choices.map(cost => [`${cost.generic}|${cost.x}|${[...cost.colors].sort().join("")}`, cost])).values()];
	}
	return choices;
}

/** Readers asking for one cost cannot silently pick a side of a hybrid symbol. */
export function symbols(text: string): ManaCost | undefined {
	const choices = manaChoices(text);
	return choices?.length === 1 ? choices[0] : undefined;
}

export const manaLabel = (cost: ManaCost, x?: number): string =>
	`${cost.generic + (x ?? 0) * cost.x} generic${cost.colors.map(color => ` + {${color}}`).join("")}${x === undefined && cost.x ? ` + ${cost.x} times X` : ""}`;
