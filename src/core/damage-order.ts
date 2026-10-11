/** A simultaneous damage group waits for affected players' replacement choices
 * in APNAP order (616.1). No result, binding or phase transition occurs early. */
import { orderedDamage } from "./damage.ts";
import { damageSource, tableWorld } from "./selectors.ts";
import { playing, seat, type Table } from "./table.ts";
import type { Change, Reason } from "./syntax.ts";
import type { Pending } from "./moves.ts";

export type DamageOrder = { changes: Change[]; reason: Reason };

function unanswered(table: Table, changes: Change[]) {
	if (!changes.some(change => change.do === "damage")) return undefined;
	const world = tableWorld(table), seats = playing(table).map(one => one.id);
	const first = seats.indexOf(table.cursor.active), turnOrder = [...seats.slice(first), ...seats.slice(0, first)];
	return changes.flatMap((change, index) => {
		if (change.do !== "damage") return [];
		const result = orderedDamage(world, change, damageSource(table, change.source));
		if (result.choices.length < 2) return [];
		const target = "id" in change.target ? table.things.get(change.target.id) : undefined;
		const who = "player" in change.target ? change.target.player : target!.controller;
		const name = target ? world.read(target)?.name ?? "Permanent" : seat(table, who).name;
		return [{ index, who, name, result }];
	}).sort((a, b) => turnOrder.indexOf(a.who) - turnOrder.indexOf(b.who) || a.index - b.index)[0];
}

export function beforeDamage(table: Table, changes: Change[], reason: Reason): Change[] {
	return unanswered(table, changes) ? [{ do: "damage-order", pending: { changes, reason } }] : changes;
}

export function orderingDamage(table: Table): Pending {
	const pending = table.damageOrder!, next = unanswered(table, pending.changes);
	if (!next) throw new Error("A pending damage group has no replacement choice.");
	return { situation: "replacement-order", seat: next.who, question: `Choose the next replacement for damage to ${next.name}. The whole damage group waits.`,
		moves: next.result.choices.map(effect => {
			const changes = structuredClone(pending.changes), damage = changes[next.index]!;
			if (damage.do !== "damage") throw new Error("The pending damage event changed.");
			damage.replacements = [...next.result.applied, effect.id];
			const more = unanswered(table, changes);
			return { option: { id: `damage:${next.index}:${effect.id}`, label: `Apply ${effect.label}` },
				changes: more ? [{ do: "damage-order" as const, pending: { ...pending, changes } }] : [...changes, { do: "damage-order" as const }], reason: pending.reason };
		}) };
}
