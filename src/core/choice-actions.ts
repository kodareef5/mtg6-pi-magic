/** Gather each player's choices in turn order, then carry out one simultaneous group (608.2e).
 * This supports sacrifices, private discards and fixed life loss, not arbitrary deferred effects. */
import { amount, matches, players, targetKey, type Scope } from "./selectors.ts";
import { cardsIn, seat, type Table, type Resolution } from "./table.ts";
import type { Instruction } from "./language.ts";
import type { Change } from "./syntax.ts";
import type { Choice, Step } from "./instructions.ts";
import type { ObjectRef } from "./types.ts";

export function chooseActions(table: Table, scope: Scope, instruction: Extract<Instruction, { do: "choose-actions" }>, pending: Resolution): Step {
	const count = pending.actionChoices?.count ?? Math.max(0, amount(scope, instruction.count));
	const blocked = (why: string): Step => ({ actor: scope.controller, question: why, choices: [], blocked: why });
	if (!Number.isSafeInteger(count)) return blocked("The number of action choices must be a finite nonnegative integer.");
	const ordered = players(scope, instruction.who).sort((a, b) =>
		(a - table.cursor.active + table.seats.length) % table.seats.length - (b - table.cursor.active + table.seats.length) % table.seats.length);
	const state = pending.actionChoices ?? { count, players: ordered, selected: [] };
	const actor = state.players.find(who => state.selected.filter(one => one.who === who).length < count);
	if (actor === undefined) {
		const changes: Change[] = [];
		for (const choice of state.selected) {
			const action = instruction.actions[choice.action];
			if (!action) return blocked("A selected action is no longer part of this instruction.");
			if ("loseLife" in action) { changes.push({ do: "change-life", who: choice.who, amount: -action.loseLife, reason: "resolve" }); continue; }
			const object = choice.on && table.things.get(choice.on.id);
			if (!object || object.incarnation !== choice.on!.incarnation || ("discard" in action ? object.zone !== "hand" || object.owner !== choice.who
				: object.zone !== "battlefield" || object.controller !== choice.who)) return blocked("A selected card or permanent changed before the simultaneous action.");
			changes.push({ do: "move", what: object.id, to: "graveyard", reason: "discard" in action ? "discard" : "sacrifice" });
		}
		const label = state.selected.length ? `Carry out all ${state.selected.length} selected actions simultaneously. Cards chosen for discard become public now.` : "No action choices are required.";
		return { actor: scope.controller, question: label, choices: [{ id: "finish-actions", label, changes }] };
	}
	const used = new Set(state.selected.flatMap(one => one.on ? [targetKey(one.on)] : []));
	const pick = (action: number, label: string, on?: ObjectRef): Choice => ({ id: `action-${action}${on ? `-${targetKey(on)}` : ""}`, label,
		changes: [], ...(on ? { objects: [on] } : {}), actionChoices: { ...state, selected: [...state.selected, { who: actor, action, ...(on ? { on } : {}) }] } });
	const choices = instruction.actions.flatMap((action, index): Choice[] => {
		if ("loseLife" in action) return [pick(index, `Choose to lose ${action.loseLife} life`)];
		const pool = "discard" in action ? cardsIn(table, "hand", actor) : cardsIn(table, "battlefield").filter(one =>
			one.controller === actor && matches(scope, one, action.sacrifice));
		return pool.filter(one => !used.has(targetKey(one))).map(one => {
			const name = one.faceDown ? "face-down permanent" : one.card ?? one.token?.name ?? one.copied?.spec.name ?? one.id;
			return pick(index, `Choose ${name} to ${"discard" in action ? "discard" : "sacrifice"}`, { id: one.id, incarnation: one.incarnation });
		});
	});
	const chosen = state.selected.filter(one => one.who === actor).length;
	return { actor, question: `${seat(table, actor).name}: choose action ${chosen + 1} of ${count}. Nothing happens until every player finishes choosing.`, choices,
		...(!choices.length ? { blocked: "No stated action is available; the required choice remains pending." } : {}) };
}
