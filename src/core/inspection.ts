/** Private inspections and the order of a bounded library subset during resolution. */
import { objects, players, select, type Scope } from "./selectors.ts";
import type { Instruction } from "./language.ts";
import type { Resolution, Table } from "./table.ts";
import type { Change } from "./syntax.ts";
import type { Choice, Step } from "./instructions.ts";
import type { ObjectRef } from "./types.ts";

export function inspection(table: Table, scope: Scope, instruction: Extract<Instruction, { do: "look" | "order" }>, pending: Resolution): Step {
	const who = players(scope, instruction.who)[0] ?? scope.controller;
	const named = instruction.what ? objects(scope, instruction.what) : instruction.every ? select(scope, instruction.every) : [];
	const pool = named.filter((one) => table.things.get(one.id)?.incarnation === one.incarnation);
	const ref = (one: ObjectRef): ObjectRef => ({ id: one.id, incarnation: one.incarnation });
	const bind = (list: ObjectRef[]) => instruction.as ? { bind: { [instruction.as]: { objects: list.map(ref), players: [] } } } : {};
	if (instruction.do === "look") return { actor: who, question: `Look at ${pool.length} cards privately.`, choices: [{
		id: "look", label: `Look at ${pool.length} cards`, changes: pool.map((one) => ({ do: "look", who, what: one.id })), ...bind(pool),
	}] };
	if (pool.some((one) => one.zone !== "library") || new Set(pool.map((one) => one.owner)).size > 1)
		throw new Error("An order instruction needs cards from one library.");
	const changes = (list: ObjectRef[]): Change[] => list.length ? [{ do: "order", who, whose: pool[0]!.owner, cards: list.map(ref),
		position: instruction.position as "top" | "bottom", ...(instruction.random ? { random: true } : {}) }] : [];
	if (instruction.random || !pool.length) return { actor: who, question: `Put ${pool.length} cards on the ${instruction.position} in random order.`, choices: [{
		id: "order", label: `Put ${pool.length} cards on the ${instruction.position}${instruction.random ? " in random order" : ""}`,
		changes: changes(pool), ...bind(pool),
	}] };
	const picked = pending.picked.filter((one) => pool.some((card) => card.id === one.id && card.incarnation === one.incarnation));
	const choices: Choice[] = pool.filter((one) => !picked.some((card) => card.id === one.id)).map((one) => {
		const ordered = [...picked, ref(one)], last = ordered.length === pool.length;
		return { id: one.id, label: `Place ${one.card ?? "this card"} ${picked.length + 1} of ${pool.length} (topmost first)`, objects: [ref(one)],
			...(one.card ? { cards: [one.card] } : {}), changes: last ? changes(ordered) : [], ...(last ? bind(ordered) : { pick: ref(one) }) };
	});
	return { actor: who, question: `Order ${pool.length} cards on the ${instruction.position}, from topmost to bottommost.`, choices };
}
