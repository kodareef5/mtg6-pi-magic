/** A paused instruction is table state. Priority and state checks wait for its end. */
import { cardsIn, thing, type Mana, type Table } from "./table.ts";
import { recipient } from "./procedures.ts";
import type { Pending, Move } from "./moves.ts";
import type { Change, Reason, Zone } from "./syntax.ts";

export function resolving(table: Table): Pending | null {
	const pending = table.resolution;
	if (!pending) return null;
	const ability = thing(table, pending.object).ability!;
	const instruction = ability.instructions[pending.instruction]!;
	const who = recipient(table, ability.controller, instruction.who);
	const prefix = `resolve:${pending.object}:${pending.instruction}:${pending.remaining}`;
	const next: Change = { do: "resolution", action: "next", what: pending.object };
	const continuation = (label: string, changes: Change[], skip = false): Move => ({
		option: { id: prefix, label }, changes: [...changes, { ...next, skip }], reason: "resolve",
	});
	let moves: Move[];
	switch (instruction.do) {
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
				changes: [{ do: "move", what: object.id, to: instruction.to as Zone, reason: instruction.reason as Reason }, next], reason: "resolve",
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
