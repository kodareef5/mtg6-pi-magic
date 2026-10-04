/**
 * A resolving spell or ability is table state: what is left to do, what it has
 * bound, and which targets were illegal as it began (608.2b). Its next
 * instruction is one decision for that instruction's actor, with nobody holding
 * priority. Finishing it is a checkpoint.
 */
import { characteristics } from "./characteristics.ts";
import { instructionStep } from "./instructions.ts";
import { holds, matches, players, tableWorld, targetKey, type Scope } from "./selectors.ts";
import type { Pending, Move } from "./moves.ts";
import type { Table, Thing } from "./table.ts";
import type { Change } from "./syntax.ts";

const PERMANENT = ["artifact", "battle", "creature", "enchantment", "land", "planeswalker"];

/**
 * As the top object starts resolving: its program and the targets now illegal.
 * A permanent spell enters first, and its instructions then run with `this` the
 * permanent it became.
 */
export function begin(table: Table, object: Thing): Change {
	const ability = object.ability!;
	const scope: Scope = { world: tableWorld(table), controller: ability.controller, source: object, targets: ability.targets, ...(ability.x !== undefined ? { x: ability.x } : {}) };
	const illegal = ability.slots.flatMap((slot, at) => (ability.targets[at] ?? []).filter((chosen) => {
		if ("player" in chosen) return !table.seats.some((one) => one.id === chosen.player && !one.result) || (slot.player !== "any" && !!slot.player && !players(scope, slot.player).includes(chosen.player));
		const now = table.things.get(chosen.id);
		return !now || now.incarnation !== chosen.incarnation || !slot.object || !matches(scope, now, slot.object);
	}).map(targetKey));
	const chosen = ability.targets.flat();
	const lost = chosen.length > 0 && illegal.length === chosen.length;
	const permanent = ability.timing === "spell" && !!characteristics(table, object)?.types.some((type) => PERMANENT.includes(type));
	return { do: "resolution", action: "begin", what: object.id, source: ability.timing === "spell" ? { id: object.id, incarnation: object.incarnation } : ability.source,
		program: [...(permanent ? [{ instruction: { do: "move" as const, what: "this", to: "battlefield" as const, reason: "resolve" as const } }] : []),
			...ability.instructions.map((instruction) => ({ instruction }))], illegal, ...(lost ? { lost: true } : {}) };
}

export function resolving(table: Table): Pending | null {
	const pending = table.resolution;
	if (!pending) return null;
	const object = table.things.get(pending.object)!, ability = object.ability!;
	const world = tableWorld(table), item = pending.program[0];
	const scope: Scope = { world, controller: ability.controller, source: world.lastKnown(pending.source)?.object, targets: ability.targets, illegal: pending.illegal,
		bound: { ...pending.bound, ...(item?.player !== undefined ? { player: { objects: [], players: [item.player] } } : {}) }, ...(ability.x !== undefined ? { x: ability.x } : {}) };
	const prefix = `resolve:${pending.object}:${pending.program.length}:${pending.picked.length}`;
	// An instant or sorcery still on the stack goes to the graveyard as the last part (608.2n).
	const finish = (changes: Change[]): Change[] => ability.timing === "spell" && object.zone === "stack" && !changes.some((change) => change.do === "move" && change.what === object.id)
		? [{ do: "move", what: object.id, to: "graveyard", reason: "resolve" }] : [];
	if (pending.lost || !item) {
		const label = pending.lost ? "Every target is illegal; it does not resolve (608.2b)." : `Finish resolving ${ability.claim}.`;
		return { situation: "resolution", seat: ability.controller, question: `Resolve: ${ability.claim}.`,
			moves: [{ option: { id: prefix, label }, changes: [...finish([]), { do: "resolution", action: "next", what: object.id, abort: true }], reason: "resolve" }] };
	}
	const instruction = item.instruction;
	const skipped = instruction.if && !holds(scope, instruction.if);
	const step = skipped ? { actor: ability.controller, question: "Its condition is false.", choices: [{ id: "skip", label: "Skip: its condition is false", changes: [] as Change[] }] }
		: instructionStep(table, scope, instruction, pending, ability.claim);
	if (!skipped && instruction.may && instruction.do !== "choose") step.choices.push({ id: "decline", label: "Decline: it is optional", changes: [] });
	const last = pending.program.length === 1;
	const moves: Move[] = step.choices.map((choice) => ({
		option: { id: `${prefix}:${choice.id}`, label: choice.label, ...(choice.pick ? { objects: [choice.pick] } : {}) },
		changes: [...choice.changes, ...(last && !choice.pick && !choice.expand ? finish(choice.changes) : []),
			{ do: "resolution", action: "next", what: object.id, ...(choice.pick ? { pick: choice.pick } : {}), ...(choice.bind ? { bind: choice.bind } : {}),
				...(choice.expand ? { expand: choice.expand } : {}), ...(choice.follow ? { follow: choice.follow } : {}) }],
		reason: "resolve",
	}));
	return { situation: "resolution", seat: step.actor, question: `Resolve: ${ability.claim}. ${step.question}`, moves };
}
