/** Decide whether a mana payment exists without constructing its combinations.
 * This answers feasibility only; a seat still selects the actual resources. */
import type { Price } from "./funding.ts";
import type { Mana } from "./table.ts";

type Yield = { colors: Mana["color"][]; life?: number; tapped?: { id: string }[]; reduce?: number };
type Unit = { id: string; yields: Yield[] };
const COLORS: Mana["color"][] = ["W", "U", "B", "R", "G", "C"];
const counts = (colors: Mana["color"][]) => COLORS.map((color) => colors.filter((one) => one === color).length);

/** Units with the same physical id are alternatives, never separate resources.
 * `selected` has already been excluded from `units` by the caller. */
export function canPay(units: readonly Unit[], cost: Price, life: number, selected: Yield & { used?: string[] } = { colors: [] }, reductionLimit = cost.generic): boolean {
	if (new Set(selected.used).size !== (selected.used?.length ?? 0)) return false;
	const left = cost.generic + cost.colors.length - selected.colors.length;
	const paid = counts(selected.colors), needed = counts(cost.colors).map((count, at) => Math.max(0, count - paid[at]!));
	const remainingLife = life - (cost.life ?? 0) - (selected.life ?? 0);
	const groups = new Map<string, Yield[]>();
	for (const unit of units) groups.set(unit.id, [...(groups.get(unit.id) ?? []), ...unit.yields]);
	const ids = [...groups.keys()], choices = [...groups.values()], capacity = Array(choices.length + 1).fill(0) as number[];
	const reserved = new Set(selected.used);
	// Only resources another ability can tap need to distinguish memo states.
	// Ordinary lands stay interchangeable in the search even beside a Drum.
	const shared = new Set(choices.flatMap(group => group.flatMap(one => one.tapped?.map(one => one.id) ?? [])));
	const lastUse = new Map<string, number>();
	choices.forEach((group, at) => {
		for (const id of [ids[at]!, ...group.flatMap(one => one.tapped?.map(one => one.id) ?? [])]) lastUse.set(id, at);
	});
	const discounts = choices.some(group => group.some(one => one.reduce));
	const supply: number[][] = Array.from({ length: choices.length + 1 }, () => COLORS.map(() => 0));
	for (let at = choices.length - 1; at >= 0; at--) {
		capacity[at] = capacity[at + 1]! + choices[at]!.reduce((most, one) => Math.max(most, one.colors.length + (one.reduce ?? 0)), 0);
		const yields = choices[at]!.map((one) => counts(one.colors));
		supply[at] = COLORS.map((_, color) => supply[at + 1]![color]! + yields.reduce((most, one) => Math.max(most, one[color]!), 0));
	}
	const memo = new Map<string, boolean>();
	const walk = (at: number, left: number, need: number[], generic: number, life: number, used: ReadonlySet<string>): boolean => {
		if (left < 0 || life < 0 || need.reduce((sum, count) => sum + count, 0) > left || left > capacity[at]! ||
			need.some((count, color) => count > supply[at]![color]!)) return false;
		if (left === 0) return true;
		if (at === choices.length) return false;
		const key = `${at}|${left}|${need.join(",")}|${life}${discounts ? `|${generic}` : ""}${shared.size ? `|${[...used].sort().join(",")}` : ""}`, known = memo.get(key);
		if (known !== undefined) return known;
		const retained = (more: string[] = []) => shared.size ? new Set([...used, ...more].filter(id => shared.has(id) && lastUse.get(id)! > at)) : used;
		const found = walk(at + 1, left, need, generic, life, retained()) || !reserved.has(ids[at]!) && !used.has(ids[at]!) && choices[at]!.some((one) => {
			const spending = [ids[at]!, ...one.tapped?.map(one => one.id) ?? []];
			if (new Set(spending).size !== spending.length || spending.some(id => reserved.has(id) || used.has(id))) return false;
			const made = counts(one.colors);
			const reduced = Math.min(generic, one.reduce ?? 0);
			return walk(at + 1, left - one.colors.length - reduced, need.map((count, color) => Math.max(0, count - made[color]!)), generic - reduced,
				life - (one.life ?? 0), retained(spending));
		});
		memo.set(key, found); return found;
	};
	return walk(0, left, needed, Math.min(cost.generic, reductionLimit), remainingLife, new Set());
}
