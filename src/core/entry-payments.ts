/** Entry choices pause the proposed group. No permanent enters and no cost is
 * spent until every affected controller has answered. */
import type { Table } from "./table.ts";
import { seat } from "./table.ts";
import type { Change, Reason } from "./syntax.ts";
import type { Pending } from "./moves.ts";
import { holds, tableWorld } from "./selectors.ts";
import { activeFaces } from "./faces.ts";
import { basicLandTypes, creatureTypeChoices, characteristics } from "./characteristics.ts";
import { paymentChoices } from "./costs.ts";
import { tokenObject, entryTable } from "./entry.ts";
import { entryCopy, copiedTriggers } from "./entry-copies.ts";
import type { ObjectRef } from "./types.ts";
import type { Effect } from "./language.ts";

export type Entry = { changes: Change[]; reason: Reason; clock: number; choices: Record<number, "paid" | "declined">;
	values?: Record<number, Record<string, string>>; reveals?: Record<number, string[]>;
	copyTriggers?: Record<number, { copied: ObjectRef; basis: string; effect: Effect }>;
	copies?: Record<number, string[]>; blocked?: { who: number; reason: string } };

function requirements(table: Table, changes: Change[]) {
	return changes.flatMap((change, index) => {
		if (change.do !== "token" && (change.do !== "move" || change.to !== "battlefield" || change.faceDown)) return [];
		const object = change.do === "token" ? tokenObject(change, table.cursor.clock + 1) : table.things.get(change.what)!;
		const who = change.controller ?? object.owner;
		const source = { ...object, zone: "battlefield" as const, controller: who, face: change.do === "move" ? change.face ?? (object.zone === "stack" ? object.face ?? 0 : 0) : 0 as const,
			...(change.do === "move" ? { registrations: change.registers ?? [] } : {}),
			...(change.do === "move" && change.copied ? { copied: change.copied, registrations: [] } : {}) };
		const printed = object.card ? table.printed[object.card] : undefined;
		const active = printed ? activeFaces(printed, source) : [0];
		const world = tableWorld(table);
		world.objects = [...world.objects.filter(one => one.id !== object.id), source];
		const terms = (characteristics(table, source)?.registrations ?? []).filter((one) => one.kind === "enters" && !one.affects &&
			(one.face === undefined || active.includes(one.face)) && (!one.if || holds({ world, controller: who, source }, one.if)));
		const choose = terms.flatMap((one) => one.kind === "enters" && one.choose && change.choices?.[one.choose.as] === undefined ? [one.choose] : []);
		const payment = terms.find((one) => one.kind === "enters" && one.unlessPay && change.entry === undefined);
		const cost = payment?.kind === "enters" ? payment.unlessPay : undefined;
		const life = cost && "life" in cost ? cost.life : undefined, show = cost && "show" in cost ? cost.show : undefined;
		return choose.length || cost ? [{ index, who, object, choose, life, show, tapped: payment?.kind === "enters" && payment.tapped }] : [];
	});
}
type Requirement = ReturnType<typeof requirements>[number];
const unanswered = (entry: Entry, one: Requirement) => one.choose.find((choice) => entry.values?.[one.index]?.[choice.as] === undefined);
const pending = (entry: Entry, one: Requirement) => unanswered(entry, one) || (one.life !== undefined || one.show) && entry.choices[one.index] === undefined;

/** An accepted instruction waits without splitting its physical event. */
export function beforeEntry(table: Table, changes: Change[], reason: Reason): Change[] {
	const entry: Entry = { changes, reason, clock: table.cursor.clock, choices: {} };
	const preview = entryTable(table, changes);
	return requirements(preview, changes).length || entryCopy(preview, entry) ? [{ do: "entry", entry }] : changes;
}

function answered(table: Table, entry: Entry, all: Requirement[]): Change[] {
	if (all.some((one) => pending(entry, one))) return [{ do: "entry", entry }];
	const changes = structuredClone(entry.changes);
	for (const one of all) {
		const move = changes[one.index]!;
		if (move.do !== "move" && move.do !== "token") continue;
		if (entry.values?.[one.index]) move.choices = { ...move.choices, ...entry.values[one.index] };
		if (one.life === undefined && !one.show) continue;
		move.entry = entry.choices[one.index]!;
		if (move.entry === "paid" && one.life !== undefined) changes.push({ do: "change-life", who: one.who, amount: -one.life, reason: "cost-payment" });
		// The entry replacement already applies. Choosing a basic type can remove its printed ability (305.7).
		else if (move.entry === "declined" && one.tapped) move.tapped = true;
	}
	const reveals: Change[] = [...new Set(Object.values(entry.reveals ?? {}).flat())].map((what) => ({ do: "reveal", what }));
	// Mana generated with the proposed group uses the clock of its eventual commit.
	const mana = new Map(changes.flatMap((change, index) => change.do === "add-mana" ? change.colors.map((_, unit) =>
		[`mana-${entry.clock + 1}-${index}-${unit}`, `mana-${table.cursor.clock + 1}-${index + reveals.length}-${unit}`]) : []));
	for (const change of changes) if (change.do === "spend-mana") change.ids = change.ids.map((id) => mana.get(id) ?? id);
	changes.push(...copiedTriggers(table, entry), { do: "entry" });
	return [...reveals, ...changes];
}

export function entryPayment(table: Table): Pending | null {
	const entry = table.entry;
	if (!entry) return null;
	const preview = entryTable(table, entry.changes);
	const copying = entryCopy(preview, entry);
	if (copying) return copying;
	const all = requirements(preview, entry.changes), next = all.find((one) => pending(entry, one));
	if (!next) return { situation: "replacement-order", seat: table.cursor.active, question: "Apply the prepared entry group.",
		moves: [{ option: { id: "entry:finish", label: "Complete the entry group" }, changes: answered(table, entry, all), reason: entry.reason }] };
	const choice = unanswered(entry, next), cards = next.object.card ? [next.object.card] : [], name = next.object.card ?? next.object.token!.name;
	if (choice) return { situation: "replacement-order", seat: next.who, question: `As ${name} enters, choose ${"from" in choice ? `a ${choice.from.replaceAll("-", " ")}` : choice.options.join(" or ")} for ${choice.as}.`,
		moves: ("options" in choice ? choice.options : choice.from === "creature-type" ? creatureTypeChoices() : basicLandTypes).map((value) => ({ option: { id: `entry:${next.index}:choose:${choice.as}:${value}`, label: `Choose ${value} for ${name}`, cards },
			changes: answered(table, { ...entry, values: { ...entry.values, [next.index]: { ...entry.values?.[next.index], [choice.as]: value } } }, all), reason: entry.reason })) };
	if (next.show) {
		const ways = paymentChoices(table, { world: tableWorld(table), controller: next.who, source: next.object }, { show: next.show }, next.who, next.object.id);
		return { situation: "replacement-order", seat: next.who, question: `As ${name} enters, choose or reveal cards for its entry term, or decline.`, moves: [
			...ways.map((way) => ({ option: { id: `entry:${next.index}:${way.id}`, label: way.label, cards },
				changes: answered(table, { ...entry, choices: { ...entry.choices, [next.index]: "paid" }, reveals: { ...entry.reveals,
					[next.index]: way.changes.flatMap((change) => change.do === "reveal" ? [change.what] : []) } }, all), reason: entry.reason })),
			{ option: { id: `entry:${next.index}:decline`, label: `Do not pay for ${name}'s entry term`, cards },
				changes: answered(table, { ...entry, choices: { ...entry.choices, [next.index]: "declined" } }, all), reason: entry.reason },
		] };
	}
	const life = next.life!;
	const spent = all.filter((one) => one.who === next.who && entry.choices[one.index] === "paid").reduce((sum, one) => sum + one.life!, 0);
	const paidInGroup = entry.changes.reduce((sum, change) => sum + (change.do === "change-life" && change.who === next.who && change.reason === "cost-payment" ? -change.amount : 0), 0);
	const choices = seat(table, next.who).life - spent - paidInGroup >= life ? [false, true] : [false];
	return { situation: "replacement-order", seat: next.who, question: `As ${name} enters, pay ${life} life or let its entry term tap it.`,
		moves: choices.map((pay) => ({ option: { id: `entry:${next.index}:${pay ? "pay" : "decline"}`, label: pay ? `Pay ${life} life for ${name}'s entry term` : `Do not pay for ${name}'s entry term`, cards },
			changes: answered(table, { ...entry, choices: { ...entry.choices, [next.index]: pay ? "paid" : "declined" } }, all), reason: entry.reason })) };
}
