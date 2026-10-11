/** Mana sources selected one at a time. No resource moves until confirmation. */
import { covers, paymentUnits, type Funding, type Price } from "./funding.ts";
import { canPay } from "./payment-search.ts";
import type { Frame } from "./types.ts";
import type { Mana } from "./table.ts";
import type { SeenObject } from "./work.ts";

export type PaymentPart = {
	id: string; resource: string; label: string; colors: Mana["color"][]; life: number; funding: Funding;
};

/** Existence is a resource question, not an instruction to pick the first payment. */
export const payable = (frame: Frame, cost: Price, except: ReadonlySet<string> = new Set(), spending?: SeenObject): boolean =>
	canPay(paymentUnits(frame, except, spending), cost, frame.view.players?.find((one) => one.id === frame.seat)?.life ?? 0);

export function paymentOptions(frame: Frame, cost: Price, selected: readonly string[] = [], except: ReadonlySet<string> = new Set(), spending?: SeenObject) {
	const units = paymentUnits(frame, except, spending), parts: PaymentPart[] = [];
	for (const unit of units) for (const yield_ of unit.yields) {
		const id = `mana:${parts.length}`, { colors, claim, ...terms } = yield_;
		parts.push({ id, resource: unit.id, colors, life: terms.life ?? 0,
			label: unit.pool ? `Spend ${unit.label}` : `${unit.label}${terms.sacrifice ? " and sacrifice it" : ""}${terms.life ? ` and pay ${terms.life} life` : ""} for ${colors.map((one) => `{${one}}`).join("")}${terms.spellWords ? `; grants ${terms.spellWords.join(", ")}` : ""}`,
			funding: unit.pool ? { paid: [unit.id], taps: [] } : { paid: [], taps: [{ source: { id: unit.source!.id, incarnation: unit.source!.incarnation }, colors, claim, ...terms }] } });
	}
	const picked = selected.map((id) => parts.find((one) => one.id === id));
	if (picked.some((one) => !one) || new Set(picked.map((one) => one!.resource)).size !== selected.length)
		throw new Error("A selected mana source is unavailable or selected twice.");
	const chosen = picked as PaymentPart[], spent = new Set(chosen.map((one) => one.resource));
	const remaining = units.filter((one) => !spent.has(one.id));
	const colors = chosen.flatMap((one) => one.colors), paidLife = chosen.reduce((sum, one) => sum + one.life, 0);
	const life = frame.view.players?.find((one) => one.id === frame.seat)?.life ?? 0;
	const possible = canPay(remaining, cost, life, { colors, life: paidLife });
	const missingColors = [...new Set(cost.colors)].flatMap((color) => Array(Math.max(0,
		cost.colors.filter((one) => one === color).length - colors.filter((one) => one === color).length)).fill(color) as Mana["color"][]);
	const next = possible ? parts.filter((one) => !spent.has(one.resource) && canPay(remaining.filter((unit) => unit.id !== one.resource), cost, life,
		{ colors: [...colors, ...one.colors], life: paidLife + one.life })) : [];
	return { units, parts, chosen, next, possible, complete: possible && covers(colors, cost), remainingMana: cost.generic + cost.colors.length - colors.length, missingColors,
		funding: { paid: chosen.flatMap((one) => one.funding.paid), taps: chosen.flatMap((one) => one.funding.taps) } };
}
