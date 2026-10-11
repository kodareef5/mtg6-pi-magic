/** Projected combat arithmetic retrieved for one named pair. */
import type { Frame } from "../core/types.ts";
import { blockConflicts, combatExchange } from "../core/combat-facts.ts";
import type { Lookup } from "./reason.ts";

const creatures = (frame: Frame) => (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.traits?.types.includes("creature"));
const ref = (one: ReturnType<typeof creatures>[number]) => ({ id: one.id, incarnation: one.incarnation, name: one.card ?? one.token?.name });

export function combatLookup(frame: Frame): Lookup {
	const field = creatures(frame), ids = field.map((one) => one.id), source = { type: "string", ...(ids.length ? { enum: ids } : {}) };
	const walkers = (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.traits?.types.includes("planeswalker"));
	return { name: "combat", description: "Calculate one current creature's unblocked damage or its exchange with one named blocker, including first/double strike. Optional defender names an opposing planeswalker; otherwise uses its committed attack or the opposing player. Uses projected characteristics and reports keyword conflicts; does not predict responses, triggers, replacements, a multi-blocker assignment or future creatures.",
		parameters: { type: "object", properties: { attacker: source, blocker: source, defender: { type: "string", ...(walkers.length ? { enum: walkers.map((one) => one.id) } : {}) } }, required: ["attacker"], additionalProperties: false },
		answer: ({ attacker, blocker, defender }) => {
			const source = field.find((one) => one.id === attacker), target = field.find((one) => one.id === blocker);
			if (!source || blocker !== undefined && !target) return "Name current battlefield creature ids. No future source or hidden object is inspected.";
			if (target && target.controller === source.controller) return "A combat pair needs creatures controlled by opposing players.";
			const committed = frame.view.combat?.attackers.find((one) => one.id === source.id && one.incarnation === source.incarnation);
			const walker = walkers.find((one) => one.id === (defender ?? committed?.to?.id));
			if (defender !== undefined && (!walker || walker.controller === source.controller)) return "Name an opposing battlefield planeswalker as defender.";
			const recipient = walker && (defender !== undefined || !committed?.removedDefender) ? { name: walker.card ?? walker.token?.name ?? walker.id, loyalty: walker.counters.loyalty ?? 0 }
				: defender === undefined && committed?.to ? { name: "the removed planeswalker", loyalty: 0 } : undefined;
			return JSON.stringify({ attacker: ref(source), ...(target ? { blocker: ref(target), conflicts: blockConflicts(source, target) } : {}), ...(walker ? { defender: ref(walker) } : {}), exchange: combatExchange(source, target, recipient) });
		},
	};
}
