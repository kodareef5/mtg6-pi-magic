/** Damage arithmetic for one attacker and at most one blocker, with unchanged characteristics. */
import type { SeenObject } from "./work.ts";

type Fighter = Pick<SeenObject, "id" | "card" | "token" | "traits" | "damage">;
const named = (one: Fighter) => one.card ?? one.token?.name ?? one.id;

/** Marked damage counts toward lethal even on an indestructible blocker (702.19b). */
export function lethalDamage(source: { words: string[] } | undefined, target: { toughness?: number } | undefined, marked: number): number {
	const left = Math.max(0, (target?.toughness ?? 0) - marked);
	return left && source?.words.includes("deathtouch") ? 1 : left;
}

export const attackConflicts = (attacker: Fighter) => ["defender", "can't attack"].filter((word) => attacker.traits?.words.includes(word)).map((word) => `Conflicts with ${word}.`);

/** These are the same keyword conflicts offered beside a physical block, not enforced legality. */
export function blockConflicts(attacker: Fighter, blocker: Fighter, others = 0): string[] {
	const on = attacker.traits?.words ?? [], by = blocker.traits?.words ?? [], found: string[] = [];
	if (on.includes("flying") && !by.includes("flying") && !by.includes("reach")) found.push("Conflicts with flying: needs flying or reach.");
	if (on.includes("can't be blocked")) found.push("Conflicts with can't be blocked.");
	if (by.includes("can't block")) found.push("Conflicts with can't block.");
	if (on.includes("menace") && others === 0) found.push("Conflicts with menace unless another creature also blocks it.");
	if (on.includes("can't be blocked by more than one creature") && others > 0) found.push("Conflicts with can't be blocked by more than one creature.");
	return found;
}

/** The arithmetic assumes the block exists; keyword conflicts are reported separately. */
export function combatExchange(attacker: Fighter, blocker?: Fighter) {
	const fighter = (one: Fighter) => one.traits?.power === undefined || one.traits.toughness === undefined ? undefined : {
		name: named(one), power: Math.max(0, one.traits.power), toughness: one.traits.toughness,
		words: one.traits.words, marked: one.damage, destroyed: false,
	};
	const attack = fighter(attacker), block = blocker && fighter(blocker);
	if (!attack || blocker && !block) return undefined;
	const has = (one: NonNullable<typeof attack>, word: string) => one.words.includes(word);
	const early = (one: NonNullable<typeof attack>) => has(one, "first strike") || has(one, "double strike");
	const first = early(attack) || !!block && early(block);
	const steps = (first ? ["first", "normal"] as const : ["normal"] as const).map((step) => {
		const deals = (one: NonNullable<typeof attack>) => !one.destroyed && (step === "first" ? early(one) : !early(one) || has(one, "double strike"));
		let toBlocker = 0, toPlayer = 0, toAttacker = 0;
		if (deals(attack)) {
			if (block && !block.destroyed) {
				const lethal = lethalDamage(attack, block, block.marked);
				toBlocker = has(attack, "trample") ? Math.min(attack.power, lethal) : attack.power;
				if (has(attack, "trample")) toPlayer = attack.power - toBlocker;
			} else if (!blocker || has(attack, "trample")) toPlayer = attack.power;
		}
		if (block && deals(block) && !attack.destroyed) toAttacker = block.power;
		const damage = (target: NonNullable<typeof attack>, source: NonNullable<typeof attack>, amount: number) => {
			target.marked += amount;
			if (!has(target, "indestructible") && (target.marked >= target.toughness || amount > 0 && has(source, "deathtouch"))) target.destroyed = true;
		};
		// Both assignments use the creatures alive before this damage step.
		if (block) { damage(attack, block, toAttacker); damage(block, attack, toBlocker); }
		return { step, toBlocker, toAttacker, toPlayer };
	});
	const total = (key: "toBlocker" | "toAttacker" | "toPlayer") => steps.reduce((n, one) => n + one[key], 0);
	const result = (one: NonNullable<typeof attack>) => `${one.name} ${one.destroyed ? "would be destroyed by this damage" : "survives this damage"}`;
	const scope = "Damage only with unchanged characteristics; responses, triggers, prevention, replacements and life gain are not predicted. Trample assigns minimum lethal to the sole blocker. This does not choose an attack or predict a block.";
	return { steps, toPlayer: total("toPlayer"), attackerDestroyed: attack.destroyed, blockerDestroyed: block?.destroyed,
		summary: `${first ? "Across first-strike and normal damage steps" : "In normal combat damage"}: ${attack.name} deals ${total("toBlocker")} to ${block?.name ?? "blockers"} and ${total("toPlayer")} to the defending player` +
			`${block ? `; ${block.name} deals ${total("toAttacker")} back. ${result(attack)}; ${result(block)}` : ""}. ${scope}`, scope };
}
