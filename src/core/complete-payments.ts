/** Bounded complete payments. Interchangeable resources use a named representative;
 * the individual-source route still reaches every identity and mana-ability choice. */
import { covers, manaSplit, type Funding, type Price } from "./funding.ts";
import { canPay } from "./payment-search.ts";
import { paymentOptions, paymentResources, type PaymentPart } from "./payment-options.ts";
import type { Frame } from "./types.ts";

export type CompletePayment = { parts: PaymentPart[]; funding: Funding; label: string; leaves: string };
type Resource = { id: string; key: string[]; parts: PaymentPart[] };

/** Undefined means the search exceeded its bound, never a truncated shortlist.
 * Bounds limit menu construction, not legal payments or player decisions. */
export function completePayments(frame: Frame, cost: Price, menu: ReturnType<typeof paymentOptions>, limit = 16, work = 2048): CompletePayment[] | undefined {
	if (!menu.possible) return [];
	const selected = new Set(paymentResources(menu.chosen));
	const resources = new Map<string, Resource>();
	for (const unit of menu.units) {
		if (selected.has(unit.id)) continue;
		const resource = resources.get(unit.id) ?? { id: unit.id, key: [], parts: menu.parts.filter(one => one.resource === unit.id) };
		resource.key.push(unit.key); resources.set(unit.id, resource);
	}
	const groups = new Map<string, Resource[]>();
	for (const unit of resources.values()) {
		const key = JSON.stringify(unit.key);
		groups.set(key, [...groups.get(key) ?? [], unit]);
	}
	const units = [...groups.values()].flatMap(group => group.sort((a, b) => a.id.localeCompare(b.id)));
	const found: CompletePayment[] = [], signatures = new Set<string>();
	const life = frame.view.players?.find(one => one.id === frame.seat)?.life ?? 0;
	let visited = 0, overflow = false;
	const walk = (at: number, parts: PaymentPart[]) => {
		if (overflow) return;
		if (++visited > work) { overflow = true; return; }
		const colors = parts.flatMap(one => one.colors), paidLife = parts.reduce((sum, one) => sum + one.life, 0);
		const used = paymentResources(parts);
		if (!canPay(units.slice(at).map(one => ({ id: one.id, yields: one.parts })), cost, life, { colors, life: paidLife, used })) return;
		if (covers(colors, cost)) {
			const funding = { paid: parts.flatMap(one => one.funding.paid), taps: parts.flatMap(one => one.funding.taps) };
			const signature = JSON.stringify(funding);
			if (signatures.has(signature)) return;
			signatures.add(signature);
			if (found.length === limit) { overflow = true; return; }
			const spent = new Set(used);
			const open = [...new Map(menu.units.filter(one => one.source && !menu.leaving?.has(one.id) && !spent.has(one.id) && one.yields.some(one => !one.tapped?.some(one => spent.has(one.id)))).map(one => [one.id, one.source!])).values()];
			const floating = menu.units.filter(one => one.pool && !spent.has(one.id));
			const produced = funding.taps.flatMap(tap => manaSplit(tap).remaining.map(color => `{${color}}${tap.spendOnly || tap.spendFrom ? " (restricted)" : ""}${tap.until ? ` (until ${tap.until})` : ""}${tap.spellWords?.length ? ` (grants ${tap.spellWords.join(", ")})` : ""}`));
			found.push({ parts, funding, label: parts.length ? parts.map(one => one.label).join("; ") : "No mana is spent",
				leaves: [open.length ? `Leaves available: ${open.map(one => `${one.card ?? one.token?.name ?? one.id} (${one.id})`).join(", ")}.` : "Leaves no unused mana source from this payment menu.",
					...(floating.length || produced.length ? [`Keeps floating: ${[...floating.map(one => one.label), ...produced].join(", ")}.`] : [])].join(" ") });
			return;
		}
		const unit = units[at];
		if (!unit) return;
		// Choosing fewer identical resources uses a prefix of their named ids.
		let next = at + 1;
		while (next < units.length && JSON.stringify(units[next]!.key) === JSON.stringify(unit.key)) next++;
		walk(next, parts);
		for (const part of unit.parts) walk(at + 1, [...parts, part]);
	};
	walk(0, [...menu.chosen]);
	return overflow ? undefined : found;
}
