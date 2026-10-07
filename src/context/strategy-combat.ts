/** Projected combat arithmetic retrieved for one named pair. */
import type { Frame } from "../core/types.ts";
import { blockConflicts, combatExchange } from "../core/combat-facts.ts";
import type { Lookup } from "./reason.ts";

const creatures = (frame: Frame) => (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.traits?.types.includes("creature"));
const ref = (one: ReturnType<typeof creatures>[number]) => ({ id: one.id, incarnation: one.incarnation, name: one.card ?? one.token?.name });

/** Put existing pair arithmetic beside the roster; no attack or block is selected. */
export function combatFacts(frame: Frame) {
	const field = creatures(frame);
	const damage = (source: typeof field[number], target?: typeof field[number]) => {
		const exchange = combatExchange(source, target);
		return exchange && { toPlayer: exchange.toPlayer, attackerDestroyed: exchange.attackerDestroyed,
			...(target ? { blockerDestroyed: exchange.blockerDestroyed } : {}) };
	};
	return {
		scope: "Separate hypothetical single-blocker exchanges using current characteristics, including first/double strike. Read attack readiness from the roster and block conflicts below. These pairs do not predict a whole combat, triggers, responses, prevention, replacements, life gain or future creatures. A destroyed blocker still prevents player damage without trample.",
		creatures: field.map((attacker) => ({ attacker: ref(attacker), unblocked: damage(attacker),
			blocks: field.filter((blocker) => blocker.controller !== attacker.controller).map((blocker) => ({ blocker: ref(blocker),
				conflicts: [...(blocker.tapped ? ["Blocker is tapped now."] : []), ...blockConflicts(attacker, blocker)],
				damage: damage(attacker, blocker) })) })),
	};
}

export function combatLookup(frame: Frame): Lookup {
	const field = creatures(frame), ids = field.map((one) => one.id), source = { type: "string", ...(ids.length ? { enum: ids } : {}) };
	return { name: "combat", description: "Calculate one current creature's unblocked damage or its exchange with one named blocker, including first/double strike. Uses projected characteristics and reports keyword conflicts; does not predict responses, triggers, replacements, a multi-blocker assignment or future creatures.",
		parameters: { type: "object", properties: { attacker: source, blocker: source }, required: ["attacker"], additionalProperties: false },
		answer: ({ attacker, blocker }) => {
			const source = field.find((one) => one.id === attacker), target = field.find((one) => one.id === blocker);
			if (!source || blocker !== undefined && !target) return "Name current battlefield creature ids. No future source or hidden object is inspected.";
			if (target && target.controller === source.controller) return "A combat pair needs creatures controlled by opposing players.";
			return JSON.stringify({ attacker: ref(source), ...(target ? { blocker: ref(target), conflicts: blockConflicts(source, target) } : {}), exchange: combatExchange(source, target) });
		},
	};
}
