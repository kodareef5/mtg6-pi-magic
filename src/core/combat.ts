/**
 * The combat phase's turn-based actions (506-511): declaring attackers, declaring
 * blockers, and assigning and dealing combat damage.
 *
 * A declaration is made one creature at a time and finished with `done`;
 * nothing moves and nothing triggers until then, when the whole declaration is
 * one group (508.1, 509.1). The table lists every creature that can physically
 * attack or block. A choice that conflicts with a registered word, such as a
 * lone blocker on a menace attacker, is marked and never removed: the players
 * and the judge enforce the words.
 *
 * Damage is divided as the controller chooses (510.1c-d); trample has to assign
 * lethal damage to every blocker before any reaches the player (702.19b). All of
 * it is dealt at once (510.2). First and double strike add a damage step (510.4).
 */
import { characteristics, has, sick, type Traits } from "./characteristics.ts";
import { cardsIn, playing, type Table, type Thing } from "./table.ts";
import type { Change } from "./syntax.ts";
import type { Chosen } from "./selectors.ts";
import type { Move, Pending } from "./moves.ts";
import type { ObjectRef, SeatId } from "./types.ts";

const ref = (object: Pick<Thing, "id" | "incarnation">): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
const same = (a: ObjectRef, b: ObjectRef) => a.id === b.id && a.incarnation === b.incarnation;
const name = (object: Thing) => object.card ?? object.token?.name ?? object.id;
const body = (traits?: Traits) => `${traits?.power ?? "?"}/${traits?.toughness ?? "?"}`;
const words = (traits?: Traits) => traits?.words.length ? `, ${traits.words.join(", ")}` : "";

/** A creature still in combat: the same object, on the battlefield, still a creature (506.4). */
function present(table: Table, wanted: ObjectRef): Thing | undefined {
	const object = table.things.get(wanted.id);
	return object && same(object, wanted) && object.zone === "battlefield" && characteristics(table, object)?.types.includes("creature") ? object : undefined;
}
const traitsOf = (table: Table, object: Thing) => characteristics(table, object);

/** 508.1: the active player picks attackers one at a time, then finishes. */
export function declareAttackers(table: Table): Pending {
	const active = table.cursor.active;
	const defending = playing(table).find((one) => one.id !== active)!.id;
	const chosen = (table.combat?.choosing ?? []).flatMap((pick) => "blocker" in pick ? [] : [pick.attacker]);
	const able = cardsIn(table, "battlefield").filter((object) => {
		const traits = traitsOf(table, object);
		return object.controller === active && !object.tapped && !!traits?.types.includes("creature") && !traits.types.includes("battle") &&
			!sick(table, object) && !chosen.some((one) => same(one, object));
	}).sort((a, b) => a.id.localeCompare(b.id));
	const attackers = chosen.flatMap((one) => present(table, one) ?? []);
	const moves: Move[] = able.map((object) => {
		const traits = traitsOf(table, object);
		const marks = (["defender", "can't attack"] as const).filter((word) => has(traits, word)).map((word) => `Conflicts with ${word}.`);
		return { option: { id: `attack:${object.id}`, label: `Attack with ${name(object)} (${body(traits)}${words(traits)})`, objects: [ref(object)],
			...(marks.length ? { shows: marks.join(" ") } : {}) },
			changes: [{ do: "combat", action: "choose", pick: { attacker: ref(object) } }], reason: "combat" };
	});
	moves.push({ option: { id: "attack:done", label: attackers.length ? `Finish: attack with ${attackers.map(name).join(", ")}` : "Attack with nothing",
		...(attackers.length ? { objects: attackers.map(ref) } : {}) },
		changes: [
			// 508.1f, 702.20b: attacking taps, unless the creature has vigilance.
			...attackers.filter((object) => !has(traitsOf(table, object), "vigilance")).map((object): Change => ({ do: "tap", what: object.id })),
			{ do: "attack", attackers: attackers.map((object) => ({ ...ref(object), defending })) },
		], reason: "combat" });
	return { situation: "turn-based", seat: active, question: chosen.length ? `Declare attackers: ${attackers.map(name).join(", ")} so far. Add another or finish.` : "Declare attackers, one at a time, then finish.", moves };
}

/** Why a block conflicts with a registered word, or nothing. */
function conflicts(table: Table, blocker: Thing, attacker: Thing, others: number): string[] {
	const by = traitsOf(table, blocker), on = traitsOf(table, attacker), found: string[] = [];
	if (has(on, "flying") && !has(by, "flying") && !has(by, "reach")) found.push("Conflicts with flying: needs flying or reach.");
	if (has(on, "can't be blocked")) found.push("Conflicts with can't be blocked.");
	if (has(by, "can't block")) found.push("Conflicts with can't block.");
	if (has(on, "menace") && others === 0) found.push("Conflicts with menace unless another creature also blocks it.");
	if (has(on, "can't be blocked by more than one creature") && others > 0) found.push("Conflicts with can't be blocked by more than one creature.");
	return found;
}

/** 509.1: the defending player picks blocks one at a time, then finishes. */
export function declareBlockers(table: Table): Pending {
	const combat = table.combat!;
	const attackers = combat.attackers.flatMap((one) => present(table, one) ?? []);
	const defending = combat.attackers[0]?.defending ?? playing(table).find((one) => one.id !== table.cursor.active)!.id;
	const blocks = combat.choosing.flatMap((pick) => "blocker" in pick ? [pick] : []);
	const blocking = (attacker: Thing) => blocks.filter((pick) => same(pick.attacker, attacker)).length;
	const able = cardsIn(table, "battlefield").filter((object) => {
		const traits = traitsOf(table, object);
		return object.controller === defending && !object.tapped && !!traits?.types.includes("creature") && !traits.types.includes("battle") &&
			!blocks.some((pick) => same(pick.blocker, object));
	}).sort((a, b) => a.id.localeCompare(b.id));
	const moves: Move[] = able.flatMap((blocker) => attackers.map((attacker): Move => {
		const marks = conflicts(table, blocker, attacker, blocking(attacker));
		return { option: { id: `block:${blocker.id}:${attacker.id}`, label: `Block ${name(attacker)} (${body(traitsOf(table, attacker))}${words(traitsOf(table, attacker))}) with ${name(blocker)} (${body(traitsOf(table, blocker))}${words(traitsOf(table, blocker))})`,
			objects: [ref(blocker), ref(attacker)], ...(marks.length ? { shows: marks.join(" ") } : {}) },
			changes: [{ do: "combat", action: "choose", pick: { blocker: ref(blocker), attacker: ref(attacker) } }], reason: "combat" };
	}));
	const declared = new Map<string, { blocker: Thing; blocking: ObjectRef[] }>();
	for (const pick of blocks) {
		const blocker = present(table, pick.blocker);
		if (!blocker || !present(table, pick.attacker)) continue;
		const entry = declared.get(blocker.id) ?? { blocker, blocking: [] };
		entry.blocking.push(pick.attacker);
		declared.set(blocker.id, entry);
	}
	const lone = attackers.filter((attacker) => has(traitsOf(table, attacker), "menace") && blocking(attacker) === 1);
	moves.push({ option: { id: "block:done", label: declared.size ? `Finish: ${[...declared.values()].map((entry) => `${name(entry.blocker)} blocks ${entry.blocking.map((one) => name(table.things.get(one.id)!)).join(", ")}`).join("; ")}` : "Block nothing",
		...(lone.length ? { shows: lone.map((attacker) => `${name(attacker)} conflicts with menace: one creature blocks it.`).join(" ") } : {}) },
		changes: [{ do: "block", blockers: [...declared.values()].map((entry) => ({ ...ref(entry.blocker), blocking: entry.blocking })) }], reason: "combat" });
	return { situation: "turn-based", seat: defending, question: blocks.length ? `Declare blockers: ${blocks.length} chosen so far. Add another or finish.` : "Declare blockers, one at a time, then finish.", moves };
}

/** Every way to divide `total` among `parts` recipients, in order. */
function divisions(total: number, parts: number): number[][] {
	if (parts === 1) return [[total]];
	return Array.from({ length: total + 1 }, (_, first) => first).flatMap((first) => divisions(total - first, parts - 1).map((rest) => [first, ...rest]));
}

/**
 * 510.1-2. Each creature in this step assigns damage equal to its power. When an
 * attacker's division is a choice, its controller is asked; once every division
 * is known, all of it is dealt in one group.
 */
export function combatDamage(table: Table): Pending | null {
	const combat = table.combat;
	if (!combat) return null;
	const attackers = combat.attackers.flatMap((one) => { const object = present(table, one); return object ? [{ object, defending: one.defending }] : []; });
	const blockers = combat.blockers.flatMap((one) => { const object = present(table, one); return object ? [{ object, blocking: one.blocking }] : []; });
	const striking = (object: Thing) => has(traitsOf(table, object), "first strike") || has(traitsOf(table, object), "double strike");
	const fighting = [...attackers.map((one) => one.object), ...blockers.map((one) => one.object)];
	// 510.4: as the step begins, decide whether this is the first of two damage steps.
	const first = combat.first === undefined && fighting.some(striking) ? fighting.filter(striking).map(ref) : undefined;
	const deals = (object: Thing) => first ? first.some((one) => same(one, object))
		: !combat.first || !combat.first.some((one) => same(one, object)) || has(traitsOf(table, object), "double strike");
	const power = (object: Thing) => Math.max(0, traitsOf(table, object)?.power ?? 0);

	const dealt: { source: Thing; to: Chosen; amount: number }[] = [];
	for (const { object: attacker, defending } of attackers) {
		if (!deals(attacker) || !power(attacker)) continue;
		const total = power(attacker), trample = has(traitsOf(table, attacker), "trample");
		const walls = blockers.filter((one) => one.blocking.some((aimed) => same(aimed, attacker))).map((one) => one.object);
		const blocked = combat.blocked.some((one) => same(one, attacker));
		if (!blocked || (!walls.length && trample)) { dealt.push({ source: attacker, to: { player: defending }, amount: total }); continue; }
		if (!walls.length) continue;
		if (walls.length === 1 && !trample) { dealt.push({ source: attacker, to: ref(walls[0]!), amount: total }); continue; }
		const chosen = combat.assigned.filter((one) => same(one.source, attacker));
		if (chosen.length) { dealt.push(...chosen.map((one) => ({ source: attacker, to: one.to, amount: one.amount }))); continue; }
		return assign(table, attacker, walls, defending, total, trample);
	}
	// A blocker blocks one attacker here, so its damage needs no division (510.1d).
	for (const { object: blocker, blocking } of blockers) {
		const aimed = blocking.flatMap((one) => present(table, one) ?? []);
		if (deals(blocker) && power(blocker) && aimed.length === 1) dealt.push({ source: blocker, to: ref(aimed[0]!), amount: power(blocker) });
	}
	const changes: Change[] = [
		...(first ? [{ do: "combat" as const, action: "strike" as const, first }] : []),
		...dealt.filter((one) => one.amount > 0).map((one): Change => ({ do: "damage", source: one.source.id, target: "player" in one.to ? { player: one.to.player } : one.to, amount: one.amount, combat: true })),
	];
	if (!changes.length) return null;
	const said = dealt.map((one) => `${name(one.source)} deals ${one.amount} to ${"player" in one.to ? `seat ${one.to.player}` : name(table.things.get(one.to.id)!)}`);
	return { situation: "turn-based", seat: table.cursor.active, question: first ? "First-strike combat damage." : "Combat damage.",
		moves: [{ option: { id: "damage", label: said.length ? `Deal combat damage: ${said.join("; ")}` : "No combat damage", ...(first ? { shows: "First and double strike deal damage now; the rest in a second damage step." } : {}) },
			changes, reason: "combat" }] };
}

/** One attacker's divisions among its blockers and, with trample, the player it attacks. */
function assign(table: Table, attacker: Thing, walls: Thing[], defending: SeatId, total: number, trample: boolean): Pending {
	const deathtouch = has(traitsOf(table, attacker), "deathtouch");
	// 702.19b, 702.2c: lethal counts damage already marked, and any damage from deathtouch is lethal.
	const lethal = (wall: Thing) => deathtouch ? 1 : Math.max(0, (traitsOf(table, wall)?.toughness ?? 0) - wall.damage);
	const recipients: Chosen[] = [...walls.map(ref), ...(trample ? [{ player: defending }] : [])];
	const legal = divisions(total, recipients.length).filter((parts) => !trample || parts.at(-1) === 0 || walls.every((wall, at) => parts[at]! >= lethal(wall)));
	const describe = (to: Chosen) => "player" in to ? `seat ${to.player}` : name(table.things.get(to.id)!);
	const moves: Move[] = legal.map((parts) => ({
		option: { id: `assign:${attacker.id}:${parts.join("-")}`, label: `${name(attacker)} assigns ${recipients.map((to, at) => `${parts[at]} to ${describe(to)}`).join(", ")}`,
			shows: walls.map((wall) => `${name(wall)} ${body(traitsOf(table, wall))}, ${wall.damage} marked, lethal ${lethal(wall)}.`).join(" "), objects: [ref(attacker), ...walls.map(ref)] },
		changes: [{ do: "combat", action: "assign", source: ref(attacker), division: recipients.map((to, at) => ({ to, amount: parts[at]! })).filter((part) => part.amount > 0) }],
		reason: "combat",
	}));
	return { situation: "turn-based", seat: attacker.controller, question: `Divide ${name(attacker)}'s ${total} combat damage${trample ? "; with trample, the player only after every blocker has lethal damage" : ""} (510.1c).`, moves };
}
