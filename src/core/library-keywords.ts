/** Scry and surveil share a private window, selection and ordering, then one completion event. */
import type { Instruction } from "./language.ts";
import type { Table, Resolution } from "./table.ts";
import type { Step } from "./instructions.ts";
import { amount, players, type Scope } from "./selectors.ts";

export function libraryKeyword(table: Table, scope: Scope, instruction: Extract<Instruction, { do: "keyword" }>): Step {
	const actors = players(scope, instruction.who), count = Math.max(0, amount(scope, instruction.count));
	if (actors.length !== 1) return { actor: scope.controller, question: "Choose simultaneous library keyword actions.", choices: [],
		blocked: "Scry and surveil currently require one player. Simultaneous private choices by several players are not supported." };
	const who = actors[0]!, bind = instruction.as ? { [instruction.as]: { objects: [], players: [], amount: 0 } } : undefined;
	if (!count) return { actor: who, question: `${instruction.name} 0 does nothing.`, choices: [{ id: "zero", label: "No keyword event", changes: [], ...(bind ? { bind } : {}) }] };
	const window = `keyword-looked-${table.cursor.clock}`, chosen = `keyword-chosen-${table.cursor.clock}`;
	const from = { zones: ["library"], is: `bound:${window}` };
	const program: Instruction[] = [
		{ do: "look", who: "bound:player", what: { top: count, of: "bound:player" }, as: window },
		{ do: "choose", who: "bound:player", from, count, upTo: true, as: chosen },
		instruction.name === "scry" ? { do: "order", who: "bound:player", what: `bound:${chosen}`, position: "bottom" }
			: { do: "move", what: `bound:${chosen}`, to: "graveyard", reason: "resolve" },
		{ do: "order", who: "bound:player", every: { ...from, not: { is: `bound:${chosen}` } }, position: "top" },
	];
	const expand: Resolution["program"] = program.map(inner => ({ instruction: inner, player: who }));
	if (instruction.name === "surveil") expand[1]!.detail = "Choose graveyard cards bottommost first; each later selection goes above earlier ones.";
	expand.at(-1)!.completed = { do: "keyword", name: instruction.name as "scry" | "surveil", who, count, selected: chosen, ...(instruction.as ? { as: instruction.as } : {}) };
	return { actor: who, question: `${instruction.name} ${count}.`, choices: [{ id: "begin", label: `Begin ${instruction.name} ${count}`, changes: [], expand }] };
}
