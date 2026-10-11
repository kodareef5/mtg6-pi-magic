/** Prevention applies before damage results (615.6); a prohibition defeats prevention (615.12).
 * This bucket covers all-damage effects, not bounded shields or extra effects on prevention. */
import { ZONES } from "./language.ts";
import { holds, matches, players, type World } from "./selectors.ts";
import type { Change } from "./syntax.ts";
import type { Note } from "./table.ts";

/** The committed damage and its instruction binding share the same prevention result. */
export function damageResult(world: World, damage: Extract<Change, { do: "damage" }>, source: ReturnType<World["lastKnown"]>) {
	return damage.amount && prevented(world, damage, source) ? { ...damage, amount: 0, prevented: damage.amount } : damage;
}

/** Global rules remain visible after the spell that created them has left the stack. */
export const damageNotes = (notes: readonly Note[]): string[] => notes.flatMap((note) => note.kind === "damage-rule" ? [
	`${note.combat === undefined ? "All" : note.combat ? "Combat" : "Noncombat"} damage ${note.mode === "prevent" ? "is prevented" : "can't be prevented"} (${typeof note.until === "string" ? note.until.replaceAll("-", " ") : `until the end of seat ${note.until.endOfNextTurn}'s next turn after turn ${note.until.afterTurn}`}).`,
] : []);

export function prevented(world: World, damage: Extract<Change, { do: "damage" }>, source: ReturnType<World["lastKnown"]>): boolean {
	const recipient = damage.target;
	const target = "id" in recipient ? world.objects.find((one) => one.id === recipient.id) : undefined;
	const applicable = world.notes.flatMap((note) => note.kind === "damage-rule" && (note.combat === undefined || note.combat === !!damage.combat) ? [note.mode] : []);
	for (const permanent of world.objects.filter((one) => one.zone === "battlefield")) {
		const scope = { world, source: permanent, controller: permanent.controller };
		for (const rule of world.read(permanent)?.registrations ?? []) {
			if (rule.kind !== "damage-rule" || rule.combat !== undefined && rule.combat !== !!damage.combat || rule.if && !holds(scope, rule.if)) continue;
			if (rule.from && (!source || !matches(scope, source.object, rule.from, source.traits, ZONES))) continue;
			if (rule.to && ("object" in rule.to ? !target || !matches(scope, target, rule.to.object)
				: !("player" in damage.target) || !players(scope, rule.to.player).includes(damage.target.player))) continue;
			applicable.push(rule.mode);
		}
	}
	return applicable.includes("prevent") && !applicable.includes("unpreventable");
}
