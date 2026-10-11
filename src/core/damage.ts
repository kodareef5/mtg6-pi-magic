/** Damage replacement terms, before results (614, 615). Fixed additions and
 * all-damage prevention share ordering; finite shields and multipliers are not represented. */
import { ZONES } from "./language.ts";
import { holds, matches, players, type World } from "./selectors.ts";
import type { Change } from "./syntax.ts";
import type { Note } from "./table.ts";

type Damage = Extract<Change, { do: "damage" }>;
type Effect = { id: string; label: string; mode: "prevent" | "unpreventable" | "add"; amount?: number };

/** Only fixed positive additions and all-damage prevention are admitted. Their
 * final dealt amount is independent of order; the recorded prevented amount is not. */
export function damageResult(world: World, damage: Damage, source: ReturnType<World["lastKnown"]>): Damage {
	let result = orderedDamage(world, damage, source);
	while (result.choices.length) result = orderedDamage(world, { ...damage, replacements: [...result.applied, result.choices[0]!.id] }, source);
	return result.damage;
}

/** Apply recorded choices and compulsory single effects without changing the table. */
export function orderedDamage(world: World, damage: Damage, source: ReturnType<World["lastKnown"]>) {
	const rules = effects(world, damage, source), unpreventable = rules.some(one => one.mode === "unpreventable");
	const remaining = rules.filter(one => one.mode !== "unpreventable"), applied: string[] = [];
	let amount = damage.amount, stopped = damage.prevented;
	const apply = (id: string) => {
		const index = remaining.findIndex(one => one.id === id);
		if (index < 0 || amount <= 0) throw new Error("The recorded damage replacement no longer applies.");
		const [one] = remaining.splice(index, 1); applied.push(id);
		if (one!.mode === "add") amount += one!.amount!;
		else if (!unpreventable) { stopped = amount; amount = 0; }
	};
	for (const id of damage.replacements ?? []) apply(id);
	while (amount > 0 && remaining.length === 1) apply(remaining[0]!.id);
	return { damage: { ...damage, amount, ...(stopped === undefined ? {} : { prevented: stopped }),
		...(damage.replacements ? { replacements: applied } : {}) }, applied, choices: amount > 0 ? remaining : [] };
}

/** Global rules remain visible after the spell that created them has left the stack. */
export const damageNotes = (notes: readonly Note[]): string[] => notes.flatMap((note) => note.kind === "damage-rule" ? [
	`${note.combat === undefined ? "All" : note.combat ? "Combat" : "Noncombat"} damage ${note.mode === "prevent" ? "is prevented" : "can't be prevented"} (${typeof note.until === "string" ? note.until.replaceAll("-", " ") : `until the end of seat ${note.until.endOfNextTurn}'s next turn after turn ${note.until.afterTurn}`}).`,
] : []);

export function prevented(world: World, damage: Damage, source: ReturnType<World["lastKnown"]>): boolean {
	const modes = effects(world, damage, source).map(one => one.mode);
	return modes.includes("prevent") && !modes.includes("unpreventable");
}

function effects(world: World, damage: Damage, source: ReturnType<World["lastKnown"]>): Effect[] {
	const recipient = damage.target;
	const target = "id" in recipient ? world.objects.find((one) => one.id === recipient.id) : undefined;
	const applicable: Effect[] = world.notes.flatMap((note) => note.kind === "damage-rule" && (note.combat === undefined || note.combat === !!damage.combat)
		? [{ id: `note:${note.id}`, label: note.mode === "prevent" ? "Prevent all matching damage" : "Damage can't be prevented", mode: note.mode }] : []);
	for (const permanent of world.objects.filter((one) => one.zone === "battlefield")) {
		const scope = { world, source: permanent, controller: permanent.controller };
		for (const [index, rule] of (world.read(permanent)?.registrations ?? []).entries()) {
			if (rule.kind !== "damage-rule" || rule.combat !== undefined && rule.combat !== !!damage.combat || rule.if && !holds(scope, rule.if)) continue;
			if (rule.from && (!source || !matches(scope, source.object, rule.from, source.traits, ZONES))) continue;
			if (rule.to && ("object" in rule.to ? !target || !matches(scope, target, rule.to.object)
				: !("player" in damage.target) || !players(scope, rule.to.player).includes(damage.target.player))) continue;
			applicable.push({ id: `${permanent.id}@${permanent.incarnation}:${index}`, label: `${world.read(permanent)?.name ?? "Permanent"}: ${rule.basis}`,
				mode: rule.mode, ...(rule.amount === undefined ? {} : { amount: rule.amount }) });
		}
	}
	return applicable;
}
