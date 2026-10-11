/** Damage arithmetic for one attacker and at most one blocker, with unchanged characteristics. */
import type { SeenObject } from "./work.ts";
import { matches, type World } from "./selectors.ts";

type Fighter = Pick<SeenObject, "id" | "card" | "token" | "traits" | "damage">;
const named = (one: Fighter) => one.card ?? one.token?.name ?? one.id;

/** Marked damage counts toward lethal even on an indestructible blocker (702.19b). */
export function lethalDamage(source: { words: string[] } | undefined, target: { toughness?: number } | undefined, marked: number): number {
	const left = Math.max(0, (target?.toughness ?? 0) - marked);
	return left && source?.words.includes("deathtouch") ? 1 : left;
}

export const attackConflicts = (attacker: Fighter) => ["defender", "can't attack"].filter((word) => attacker.traits?.words.includes(word)).map((word) => `Conflicts with ${word}.`);

/** The same source-backed conflicts accompany a physical block and its projected analysis. */
export function blockConflicts(attacker: Fighter & { incarnation: number }, blocker: Fighter & { incarnation: number }, world: World, others = 0): string[] {
	const on = attacker.traits?.words ?? [], by = blocker.traits?.words ?? [], found: string[] = [];
	if (on.includes("flying") && !by.includes("flying") && !by.includes("reach")) found.push("Conflicts with flying: needs flying or reach.");
	if (on.includes("can't be blocked")) found.push("Conflicts with can't be blocked.");
	if (by.includes("can't block")) found.push("Conflicts with can't block.");
	if (on.includes("menace") && others === 0) found.push("Conflicts with menace unless another creature also blocks it.");
	if (on.includes("can't be blocked by more than one creature") && others > 0) found.push("Conflicts with can't be blocked by more than one creature.");
	const attack = world.objects.find(one => one.id === attacker.id && one.incarnation === attacker.incarnation);
	const block = world.objects.find(one => one.id === blocker.id && one.incarnation === blocker.incarnation);
	if (attack && block) for (const source of world.objects.filter(one => one.zone === "battlefield")) {
		const scope = { world, source, controller: source.controller };
		for (const rule of world.read(source)?.registrations ?? []) if (rule.kind === "prohibit" && "block" in rule &&
			matches(scope, attack, rule.block.attacker) && matches(scope, block, rule.block.blocker))
			found.push(`Conflicts with ${world.read(source)?.name ?? source.id}: ${rule.basis}`);
	}
	return found;
}

/** The arithmetic assumes the block exists; keyword conflicts are reported separately. */
export function combatExchange(attacker: Fighter, blocker?: Fighter, defender?: { name: string; loyalty: number }) {
	const fighter = (one: Fighter) => one.traits?.power === undefined || one.traits.toughness === undefined ? undefined : {
		name: named(one), power: Math.max(0, one.traits.power), toughness: one.traits.toughness,
		words: one.traits.words, marked: one.damage, destroyed: false,
	};
	const attack = fighter(attacker), block = blocker && fighter(blocker);
	if (!attack || blocker && !block) return undefined;
	const has = (one: NonNullable<typeof attack>, word: string) => one.words.includes(word);
	const early = (one: NonNullable<typeof attack>) => has(one, "first strike") || has(one, "double strike");
	const first = early(attack) || !!block && early(block);
	let loyalty = defender?.loyalty ?? 0;
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
		const toPlaneswalker = defender && loyalty > 0 ? toPlayer : 0;
		if (defender) { toPlayer = 0; loyalty = Math.max(0, loyalty - toPlaneswalker); }
		return { step, toBlocker, toAttacker, toPlayer, ...(defender ? { toPlaneswalker } : {}) };
	});
	const total = (key: "toBlocker" | "toAttacker" | "toPlayer") => steps.reduce((n, one) => n + one[key], 0);
	const result = (one: NonNullable<typeof attack>) => `${one.name} ${one.destroyed ? "would be destroyed by this damage" : "survives this damage"}`;
	const scope = "Damage only with unchanged characteristics; responses, triggers, prevention, replacements and life gain are not predicted. Trample assigns minimum lethal to the sole blocker. This does not choose an attack or predict a block.";
	const toPlaneswalker = steps.reduce((n, one) => n + (one.toPlaneswalker ?? 0), 0);
	return { steps, toPlayer: total("toPlayer"), ...(defender ? { toPlaneswalker, loyaltyAfter: loyalty } : {}), attackerDestroyed: attack.destroyed, blockerDestroyed: block?.destroyed,
		summary: `${first ? "Across first-strike and normal damage steps" : "In normal combat damage"}: ${attack.name} deals ${total("toBlocker")} to ${block?.name ?? "blockers"} and ${defender ? `${toPlaneswalker} to ${defender.name}; ${loyalty} loyalty remains` : `${total("toPlayer")} to the defending player`}` +
			`${block ? `; ${block.name} deals ${total("toAttacker")} back. ${result(attack)}; ${result(block)}` : ""}. ${scope}`, scope };
}
