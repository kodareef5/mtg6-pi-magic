/** Private inspections and the order of a bounded library subset during resolution. */
import { matches, objects, players, select, type Scope } from "./selectors.ts";
import type { Instruction, Selector } from "./language.ts";
import type { Resolution, Table } from "./table.ts";
import type { Change } from "./syntax.ts";
import type { Choice, Step } from "./instructions.ts";
import type { ObjectRef } from "./types.ts";
import { project } from "./view.ts";

/** A private selection states whose cards, or names objects already bound by an instruction. */
export const selectionScoped = (selector: Selector): boolean => !!(selector.owner || selector.controller || selector.is ||
	selector.all?.some(selectionScoped) || selector.any?.length && selector.any.every(selectionScoped));

/** A selector's identity predicates cannot establish permission to read hidden cards.
 * Library selection declares a search of an explicitly scoped library. Other private
 * selections require an earlier look, even when their hidden cards would not match. */
export function selectionBlock(table: Table, scope: Scope, from: Selector, who: number): string | undefined {
	const visible = new Set((project(table, who).objects ?? []).filter((one) => !one.faceDown).map((one) => `${one.id}@${one.incarnation}`));
	const extent = (selector: Selector): Selector => ({ zones: selector.zones, controller: selector.controller, owner: selector.owner, is: selector.is,
		...(selector.any ? { any: selector.any.map(extent) } : {}), ...(selector.all ? { all: selector.all.map(extent) } : {}) });
	const range = extent(from);
	if (!selectionScoped(from) && scope.world.objects.some((one) => one.zone === "library" &&
		matches(scope, { ...one, card: undefined, token: undefined, ability: undefined, faceDown: true }, range, undefined)))
		return "Selection reaches unseen cards without naming whose library to search or an inspected binding. State owner, controller or is explicitly; no card identities were shown.";
	return scope.world.objects.some((one) => (one.zone !== "library" || one.faceDown) && !visible.has(`${one.id}@${one.incarnation}`) &&
		matches(scope, { ...one, card: undefined, token: undefined, ability: undefined, faceDown: true }, range, undefined))
		? "Selection reaches unseen cards. Look at the other hand or hidden cards explicitly before selecting them; no card identities were shown." : undefined;
}

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
	if (!instruction.random && pool.some((one) => !pending.seen?.[who]?.some((seen) => seen.id === one.id && seen.incarnation === one.incarnation)))
		return { actor: who, question: "Ordering requires a private look at these library cards first.", choices: [], blocked: "Cannot name unseen library cards while choosing their order. The instruction remains pending." };
	const changes = (list: ObjectRef[]): Change[] => list.length ? [{ do: "order", who, whose: pool[0]!.owner, cards: list.map(ref),
		position: instruction.position as "top" | "bottom", ...(instruction.random ? { random: true } : {}) }] : [];
	if (instruction.random || !pool.length) return { actor: who, question: `Put ${pool.length} cards on the ${instruction.position} in random order.`, choices: [{
		id: "order", label: `Put ${pool.length} cards on the ${instruction.position}${instruction.random ? " in random order" : ""}`,
		changes: changes(pool), ...bind(pool),
	}] };
	const picked = pending.picked.filter((one) => "id" in one).filter((one) => pool.some((card) => card.id === one.id && card.incarnation === one.incarnation));
	const choices: Choice[] = pool.filter((one) => !picked.some((card) => card.id === one.id)).map((one) => {
		const ordered = [...picked, ref(one)], last = ordered.length === pool.length;
		return { id: one.id, label: `Place ${one.card ?? "this card"} ${picked.length + 1} of ${pool.length} (topmost first)`, objects: [ref(one)],
			...(one.card ? { cards: [one.card] } : {}), changes: last ? changes(ordered) : [], ...(last ? bind(ordered) : { pick: ref(one) }) };
	});
	return { actor: who, question: `Order ${pool.length} cards on the ${instruction.position}, from topmost to bottommost.`, choices };
}
