/** A paused instruction is table state. Priority and state checks wait for its end. */
import { cardsIn, thing, type Mana, type Table } from "./table.ts";
import { targetAvailable } from "./targets.ts";
import { project } from "./view.ts";
import { recipient } from "./procedures.ts";
import type { Pending, Move } from "./moves.ts";
import type { Change, Reason, Zone } from "./syntax.ts";

export function resolving(table: Table): Pending | null {
	const pending = table.resolution;
	if (!pending) return null;
	const ability = thing(table, pending.object).ability!;
	const instruction = ability.instructions[pending.instruction]!;
	const who = instruction && instruction.do !== "damage" ? recipient(table, ability.controller, instruction.who) : ability.controller;
	const prefix = `resolve:${pending.object}:${pending.instruction}:${pending.remaining}`;
	// Targets are checked once as resolution starts. Later instructions can
	// move or change that target without cancelling unrelated remaining effects.
	const failedTarget = pending.instruction === 0 && pending.remaining === (instruction && "count" in instruction ? instruction.count : 1) && !targetAvailable(ability, { view: project(table, ability.controller) });
	const finishes = failedTarget || !instruction || pending.instruction === ability.instructions.length - 1 && pending.remaining === 1;
	const finish: Change[] = finishes && ability.timing === "spell" ? [{ do: "move", what: pending.object,
		to: failedTarget ? "graveyard" : ability.spell!.destination, reason: "resolve" }] : [];
	const next: Change = { do: "resolution", action: "next", what: pending.object, ...(failedTarget ? { abort: true } : {}) };
	const continuation = (label: string, changes: Change[], skip = false): Move => ({
		option: { id: prefix, label }, changes: [...changes, { ...next, skip }, ...finish], reason: "resolve",
	});
	let moves: Move[];
	if (!instruction || failedTarget) return { situation: "resolution", seat: ability.controller,
		question: `Resolve: ${ability.claim}.`, delegated: ability.delegate,
		moves: [continuation(failedTarget ? "The announced target is unavailable; none of this effect's instructions resolve." : `Put ${ability.claim} into ${ability.spell!.destination}.`, [], true)] };
	switch (instruction.do) {
		case "damage": moves = [continuation(`Deal ${instruction.amount} damage to the announced target if it remains available.`, targetAvailable(ability, { view: project(table, ability.controller) })
			? [{ do: "damage", source: pending.object, target: ability.target!, amount: instruction.amount }] : [])]; break;
		case "draw": {
			const top = cardsIn(table, "library", who)[0];
			moves = [continuation(`Draw one card (${pending.remaining} remaining in this instruction)`, top
				? [{ do: "move", what: top.id, to: "hand", reason: "draw" }]
				: [{ do: "mark-player", who, key: "drew-from-empty", add: 1 }])];
			break;
		}
		case "choose-move": {
			const eligible = cardsIn(table, instruction.from as Zone).filter((object) => !object.ability &&
				(instruction.from === "battlefield" ? object.controller : object.owner) === who);
			moves = eligible.map((object) => ({
				option: { id: `${prefix}:${object.id}`, label: `Put ${object.faceDown ? "an unknown card" : object.card} into ${instruction.to} (${instruction.reason})`, objects: [{ id: object.id, incarnation: object.incarnation }] },
				changes: [{ do: "move", what: object.id, to: instruction.to as Zone, reason: instruction.reason as Reason }, next, ...finish], reason: "resolve",
			}));
			if (!moves.length) moves = [continuation("No eligible card remains; continue the instruction.", [], true)];
			break;
		}
		case "life": moves = [continuation(`Change life by ${instruction.amount}`, [{ do: "change-life", who, amount: instruction.amount, reason: "resolve" }])]; break;
		case "mana": moves = [continuation(`Add ${instruction.colors.join(" ")}`, [{ do: "add-mana", who, colors: instruction.colors as Mana["color"][] }])]; break;
	}
	const actor = instruction.do === "choose-move" ? who : ability.controller;
	return { situation: "resolution", seat: actor, question: `Resolve: ${ability.claim}. Instruction ${pending.instruction + 1} of ${ability.instructions.length}.`,
		delegated: ability.delegate && actor === ability.controller, moves };
}
