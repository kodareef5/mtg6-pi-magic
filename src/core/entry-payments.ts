/** Optional entry payments pause the proposed group. No permanent enters and
 * no life is spent until every affected controller has answered. */
import type { Table } from "./table.ts";
import { seat } from "./table.ts";
import type { Change, Reason } from "./syntax.ts";
import type { Pending } from "./moves.ts";
import { holds, tableWorld } from "./selectors.ts";
import { activeFaces } from "./faces.ts";

export type Entry = { changes: Change[]; reason: Reason; clock: number; choices: Record<number, "paid" | "declined"> };

function costs(table: Table, changes: Change[]) {
	return changes.flatMap((change, index) => {
		if (change.do !== "move" || change.to !== "battlefield" || change.entry !== undefined) return [];
		const object = table.things.get(change.what)!;
		const who = change.controller ?? object.owner;
		const source = { ...object, zone: "battlefield" as const, controller: who, face: change.face ?? (object.zone === "stack" ? object.face ?? 0 : 0) };
		const printed = object.card ? table.printed[object.card] : undefined;
		const active = printed ? activeFaces(printed, source) : [0];
		const world = tableWorld(table);
		world.objects = world.objects.map((one) => one.id === object.id ? source : one);
		const term = change.registers?.find((one) => one.kind === "enters" && !one.affects && one.unlessPay &&
			(one.face === undefined || active.includes(one.face)) &&
			(!one.if || holds({ world, controller: who, source }, one.if)));
		return term?.kind === "enters" && term.unlessPay ? [{ index, who, life: term.unlessPay.life, object }] : [];
	});
}

/** An accepted instruction waits for the entry choice without splitting its physical event. */
export function beforeEntry(table: Table, changes: Change[], reason: Reason): Change[] {
	return costs(table, changes).length ? [{ do: "entry", entry: { changes, reason, clock: table.cursor.clock, choices: {} } }] : changes;
}

export function entryPayment(table: Table): Pending | null {
	const entry = table.entry;
	if (!entry) return null;
	const all = costs(table, entry.changes), next = all.find((cost) => entry.choices[cost.index] === undefined)!;
	const spent = all.filter((cost) => cost.who === next.who && entry.choices[cost.index] === "paid").reduce((sum, cost) => sum + cost.life, 0);
	const paidInGroup = entry.changes.reduce((sum, change) => sum + (change.do === "change-life" && change.who === next.who && change.reason === "cost-payment" ? -change.amount : 0), 0);
	const choices = seat(table, next.who).life - spent - paidInGroup >= next.life ? [false, true] : [false];
	return { situation: "replacement-order", seat: next.who, question: `As ${next.object.card} enters, pay ${next.life} life or let its entry term tap it.`,
		moves: choices.map((pay) => {
			const answered = { ...entry.choices, [next.index]: pay ? "paid" as const : "declined" as const };
			let changes: Change[];
			if (all.some((cost) => answered[cost.index] === undefined)) changes = [{ do: "entry", entry: { ...entry, choices: answered } }];
			else {
				changes = structuredClone(entry.changes);
				for (const cost of all) {
					const move = changes[cost.index]!;
					if (move.do === "move") move.entry = answered[cost.index]!;
					if (answered[cost.index] === "paid") changes.push({ do: "change-life", who: cost.who, amount: -cost.life, reason: "cost-payment" });
				}
				// A payment generated with the proposed group uses the clock of its eventual commit.
				const mana = new Map(changes.flatMap((change, index) => change.do === "add-mana" ? change.colors.map((_, unit) =>
					[`mana-${entry.clock + 1}-${index}-${unit}`, `mana-${table.cursor.clock + 1}-${index}-${unit}`]) : []));
				for (const change of changes) if (change.do === "spend-mana") change.ids = change.ids.map((id) => mana.get(id) ?? id);
				changes.push({ do: "entry" });
			}
			return { option: { id: `entry:${next.index}:${pay ? "pay" : "decline"}`, label: pay ? `Pay ${next.life} life for ${next.object.card}'s entry term` : `Do not pay for ${next.object.card}'s entry term`,
				cards: next.object.card ? [next.object.card] : [] }, changes, reason: entry.reason };
		}) };
}
