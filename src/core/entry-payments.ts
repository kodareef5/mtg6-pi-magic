/** Entry choices pause the proposed group. No permanent enters and no cost is
 * spent until every affected controller has answered. */
import type { Table } from "./table.ts";
import { seat } from "./table.ts";
import type { Change, Reason } from "./syntax.ts";
import type { Pending } from "./moves.ts";
import { holds, tableWorld } from "./selectors.ts";
import { activeFaces } from "./faces.ts";
import { basicLandTypes } from "./characteristics.ts";

export type Entry = { changes: Change[]; reason: Reason; clock: number; choices: Record<number, "paid" | "declined">;
	values?: Record<number, Record<string, string>> };

function requirements(table: Table, changes: Change[]) {
	return changes.flatMap((change, index) => {
		if (change.do !== "move" || change.to !== "battlefield") return [];
		const object = table.things.get(change.what)!;
		const who = change.controller ?? object.owner;
		const source = { ...object, zone: "battlefield" as const, controller: who, face: change.face ?? (object.zone === "stack" ? object.face ?? 0 : 0) };
		const printed = object.card ? table.printed[object.card] : undefined;
		const active = printed ? activeFaces(printed, source) : [0];
		const world = tableWorld(table);
		world.objects = world.objects.map((one) => one.id === object.id ? source : one);
		const terms = (change.registers ?? []).filter((one) => one.kind === "enters" && !one.affects &&
			(one.face === undefined || active.includes(one.face)) && (!one.if || holds({ world, controller: who, source }, one.if)));
		const choose = terms.flatMap((one) => one.kind === "enters" && one.choose && change.choices?.[one.choose.as] === undefined ? [one.choose] : []);
		const payment = terms.find((one) => one.kind === "enters" && one.unlessPay && change.entry === undefined);
		const life = payment?.kind === "enters" ? payment.unlessPay?.life : undefined;
		return choose.length || life !== undefined ? [{ index, who, object, choose, life, tapped: payment?.kind === "enters" && payment.tapped }] : [];
	});
}
type Requirement = ReturnType<typeof requirements>[number];
const unanswered = (entry: Entry, one: Requirement) => one.choose.find((choice) => entry.values?.[one.index]?.[choice.as] === undefined);
const pending = (entry: Entry, one: Requirement) => unanswered(entry, one) || one.life !== undefined && entry.choices[one.index] === undefined;

/** An accepted instruction waits without splitting its physical event. */
export function beforeEntry(table: Table, changes: Change[], reason: Reason): Change[] {
	return requirements(table, changes).length ? [{ do: "entry", entry: { changes, reason, clock: table.cursor.clock, choices: {} } }] : changes;
}

function answered(table: Table, entry: Entry, all: Requirement[]): Change[] {
	if (all.some((one) => pending(entry, one))) return [{ do: "entry", entry }];
	const changes = structuredClone(entry.changes);
	for (const one of all) {
		const move = changes[one.index]!;
		if (move.do !== "move") continue;
		if (entry.values?.[one.index]) move.choices = { ...move.choices, ...entry.values[one.index] };
		if (one.life === undefined) continue;
		move.entry = entry.choices[one.index]!;
		if (move.entry === "paid") changes.push({ do: "change-life", who: one.who, amount: -one.life, reason: "cost-payment" });
		// The entry replacement already applies. Choosing a basic type can remove its printed ability (305.7).
		else if (one.tapped) move.tapped = true;
	}
	// Mana generated with the proposed group uses the clock of its eventual commit.
	const mana = new Map(changes.flatMap((change, index) => change.do === "add-mana" ? change.colors.map((_, unit) =>
		[`mana-${entry.clock + 1}-${index}-${unit}`, `mana-${table.cursor.clock + 1}-${index}-${unit}`]) : []));
	for (const change of changes) if (change.do === "spend-mana") change.ids = change.ids.map((id) => mana.get(id) ?? id);
	changes.push({ do: "entry" });
	return changes;
}

export function entryPayment(table: Table): Pending | null {
	const entry = table.entry;
	if (!entry) return null;
	const all = requirements(table, entry.changes), next = all.find((one) => pending(entry, one))!;
	const choice = unanswered(entry, next), cards = next.object.card ? [next.object.card] : [];
	if (choice) return { situation: "replacement-order", seat: next.who, question: `As ${next.object.card} enters, choose a basic land type for ${choice.as}.`,
		moves: basicLandTypes.map((value) => ({ option: { id: `entry:${next.index}:choose:${choice.as}:${value}`, label: `Choose ${value} for ${next.object.card}`, cards },
			changes: answered(table, { ...entry, values: { ...entry.values, [next.index]: { ...entry.values?.[next.index], [choice.as]: value } } }, all), reason: entry.reason })) };
	const life = next.life!;
	const spent = all.filter((one) => one.who === next.who && entry.choices[one.index] === "paid").reduce((sum, one) => sum + one.life!, 0);
	const paidInGroup = entry.changes.reduce((sum, change) => sum + (change.do === "change-life" && change.who === next.who && change.reason === "cost-payment" ? -change.amount : 0), 0);
	const choices = seat(table, next.who).life - spent - paidInGroup >= life ? [false, true] : [false];
	return { situation: "replacement-order", seat: next.who, question: `As ${next.object.card} enters, pay ${life} life or let its entry term tap it.`,
		moves: choices.map((pay) => ({ option: { id: `entry:${next.index}:${pay ? "pay" : "decline"}`, label: pay ? `Pay ${life} life for ${next.object.card}'s entry term` : `Do not pay for ${next.object.card}'s entry term`, cards },
			changes: answered(table, { ...entry, choices: { ...entry.choices, [next.index]: pay ? "paid" : "declined" } }, all), reason: entry.reason })) };
}
