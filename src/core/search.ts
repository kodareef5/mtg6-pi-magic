/** A whole-library selection starts a search before exposing private cards.
 * Bound windows are selections after a look, not searches of a library. */
import { cardsIn, seat, type Table, type Resolution } from "./table.ts";
import { matches, players, type Scope } from "./selectors.ts";
import type { Instruction, Selector } from "./language.ts";
import type { Step } from "./instructions.ts";
import type { Change } from "./syntax.ts";
import { selectionExtent, selectionScoped } from "./inspection.ts";

/** Read scope even for empty libraries, without inspecting any card identity. */
export function searchedLibraries(scope: Scope, from: Selector): number[] {
	const extent = selectionExtent(from);
	return scope.world.players.filter(({ id }) => matches(scope, { id: `search-scope-${id}`, incarnation: 0, owner: id, controller: id,
		zone: "library", tapped: false, faceDown: true, counters: {}, damage: 0 }, extent, undefined)).map(one => one.id);
}

/** 701.23b permits finding fewer cards with a stated quality; quantity alone does not. */
export const searchQuality = (from: Selector): boolean => Object.keys(from).some(key =>
	!["zones", "owner", "controller", "any", "all"].includes(key) && from[key as keyof Selector] !== undefined) ||
	!!from.all?.some(searchQuality) || !!from.any?.length && from.any.every(searchQuality);

export function beginSearch(table: Table, scope: Scope, instruction: Extract<Instruction, { do: "choose" }>, pending: Resolution, who: number): Step | undefined {
	if (table.searchesFrom === undefined || table.ledger.length < table.searchesFrom || pending.searching) return;
	const whose = searchedLibraries(scope, instruction.from);
	if (!whose.length) return;
	if (!selectionScoped(instruction.from)) {
		const blocked = "A library search must name its owner, even when the library is empty.";
		return { actor: who, question: blocked, choices: [], blocked };
	}
	if (players(scope, instruction.who).length > 1) {
		const blocked = "Simultaneous searches by several players need separate private choices in APNAP order.";
		return { actor: who, question: blocked, choices: [], blocked };
	}
	// 701.23h: repeated searches of this library before its shuffle are one search.
	const events: Change[] = whose.filter(owner => !pending.searched?.some(one => one.who === who && one.whose === owner))
		.map(owner => ({ do: "keyword", name: "search", who, whose: owner, count: 1 }));
	const names = whose.map(owner => `${seat(table, owner).name}'s library`).join(" and ");
	const choices: Step["choices"] = [{ id: "search", label: `Search ${names}`, search: { who, whose }, changes: [
		...events, ...whose.flatMap(owner => cardsIn(table, "library", owner).map(card => ({ do: "look" as const, who, what: card.id }))),
	] }];
	if (instruction.may) choices.push({ id: "decline-search", label: `Decline: do not search ${names}`, changes: [],
		...(instruction.as ? { bind: { [instruction.as]: { objects: [], players: [], amount: 0 } } } : {}) });
	return { actor: who, question: `Search ${names}. Finding no matching card still counts as searching.`, choices };
}
