/**
 * Every way a seat can announce one procedure now: each source, X, extra cost,
 * mana payment and set of targets (601.2b-h, 602.2). Built from the seat's
 * frame, so it offers only what that seat can see. The claim supplies meaning;
 * this checks timing, resources and the seat's own conditions.
 *
 * A registered word on a target the seat's opponents protect is marked in the
 * option, never removed: the table guides and does not restrain.
 * Past 150 lines because sources, costs, payments and targets combine in one offer.
 */
import { targetless } from "./printed.ts";
import { select as query } from "./query.ts";
import { capacity, fundings, sameness, sick, type Price } from "./funding.ts";
import { amount, holds, matches, objects, players, targetKey, viewWorld, type Chosen, type Scope, type Seen, type World } from "./selectors.ts";
import type { Instruction, Procedure, Target } from "./language.ts";
import { allowance, flashed } from "./permits.ts";
import { useSources } from "./readiness.ts";
import type { Activation, Mana, Paid } from "./table.ts";
import type { Frame, ObjectRef, Option, SeatId } from "./types.ts";
import type { SeenObject } from "./work.ts";

export type ProcedureOption = { option: Option; activation: Activation };
type Color = Mana["color"];

/** Generic, colored and X symbols. Hybrid and Phyrexian symbols are not read. */
export function symbols(text: string): { generic: number; colors: Color[]; x: number } | undefined {
	const parts = text.match(/\{[^}]+\}/g) ?? [];
	if (parts.join("") !== text) return undefined;
	let generic = 0, x = 0;
	const colors: Color[] = [];
	for (const symbol of parts.map((part) => part.slice(1, -1))) {
		if (/^\d+$/.test(symbol)) generic += Number(symbol);
		else if (/^[WUBRGC]$/.test(symbol)) colors.push(symbol as Color);
		else if (symbol === "X") x += 1;
		else return undefined;
	}
	return { generic, colors, x };
}

/** A reference, selector, amount or condition in plain words. Shapes this does not know read as their kind, never as JSON. */
function words(value: unknown, as: "thing" | "amount" | "condition" = "thing"): string {
	if (typeof value === "number") return String(value);
	if (typeof value === "string") {
		const target = /^target:(\d+)$/.exec(value);
		return target ? `target ${Number(target[1]) + 1}` : value.startsWith("bound:") ? `the chosen ${value.slice(6)}` : value === "event:object" ? "that object" : value;
	}
	if (!value || typeof value !== "object") return as === "amount" ? "an amount" : as === "condition" ? "a condition" : "something";
	const one = value as Record<string, unknown>;
	if (as === "condition") {
		if ("amount" in one) return `${words(one.amount, "amount")} is ${one.atLeast !== undefined ? `at least ${one.atLeast}` : `at most ${one.atMost}`}`;
		if ("bound" in one) return `a ${one.bound} was chosen`;
		if ("not" in one) return `not (${words(one.not, "condition")})`;
		return "a condition holds";
	}
	if (as === "amount") {
		if ("count" in one) return `the number of ${words(one.count)}`;
		if ("power" in one) return `the power of ${words(one.power)}`;
		if ("toughness" in one) return `the toughness of ${words(one.toughness)}`;
		if ("counters" in one) return `the number of ${one.counters} counters on ${words(one.on)}`;
		return "an amount";
	}
	// A selector: its type words, then whose zones it looks in.
	const list = (key: string) => Array.isArray(one[key]) ? (one[key] as string[]) : [];
	const zones = list("zones"), mine = one.controller === "you" || one.owner === "you";
	const kind = [...list("supertypes"), ...list("subtypes"), ...list("types")].join(" ") || (typeof one.card === "string" ? one.card : zones.length && !zones.includes("battlefield") ? "card" : "permanent");
	return zones.length ? `${kind} (${mine ? "your " : ""}${zones.join(" or ")})` : `${kind}${mine ? " you control" : ""}`;
}

/** A characteristic change in plain words. */
function changed(change: unknown): string {
	if (!change || typeof change !== "object") return "changes";
	const one = change as Record<string, unknown>, parts: string[] = [];
	const delta = (value: unknown) => typeof value === "number" ? `${value < 0 ? "" : "+"}${value}` : `+(${words(value, "amount")})`;
	if (one.power !== undefined || one.toughness !== undefined) parts.push(`${delta(one.power ?? 0)}/${delta(one.toughness ?? 0)}`);
	const base = one.base as { power?: number; toughness?: number } | undefined;
	if (base) parts.push(`base ${base.power ?? "?"}/${base.toughness ?? "?"}`);
	const types = one.types as { add?: string[] } | undefined;
	if (types?.add?.length) parts.push(`also a ${types.add.join(" ")}`);
	const subtypes = one.subtypes as { set?: string[] } | undefined;
	if (subtypes?.set?.length) parts.push(`becomes a ${subtypes.set.join(" ")}`);
	if (Array.isArray(one.words) && one.words.length) parts.push(`gains ${(one.words as string[]).join(", ")}`);
	if (Array.isArray(one.registers) && one.registers.length) parts.push("gains an ability");
	return parts.join(", ") || "changes";
}

/** One instruction in a few words, so every option says what it does at the same level of detail. */
export function summary(instruction: Instruction): string {
	const of = (value: unknown) => words(value);
	const who = (value: unknown, verb: string) => value === "you" ? `you ${verb}` : `${of(value)} ${verb}s`;
	const what = "what" in instruction && instruction.what ? of(instruction.what) : "every" in instruction && instruction.every ? `each ${of(instruction.every)}` : "";
	const gate = `${instruction.if ? ` if ${words(instruction.if, "condition")}` : ""}${instruction.may ? " (optional)" : ""}${instruction.as ? ` as ${instruction.as}` : ""}`;
	switch (instruction.do) {
		case "damage": return `Deal ${words(instruction.amount, "amount")} damage to ${instruction.to ? of(instruction.to) : what}${gate}.`;
		case "choose": return `${who(instruction.who, "choose")} ${instruction.upTo ? "up to " : ""}${of(instruction.count)} ${of(instruction.from)}${instruction.reveal ? ", revealed" : ""}${gate}.`;
		case "move": return `Put ${what} into ${instruction.to} (${instruction.reason})${instruction.tapped ? " tapped" : ""}${gate}.`;
		case "draw": case "mill": case "shuffle": return `${who(instruction.who, instruction.do)}${"count" in instruction ? ` ${of(instruction.count)}` : ""}${gate}.`;
		case "life": return `${of(instruction.who)} changes life by ${words(instruction.amount, "amount")}${gate}.`;
		case "counters": return `Put ${words(instruction.amount, "amount")} ${instruction.kind} counters on ${instruction.on ? of(instruction.on) : what}${gate}.`;
		case "mana": return `${who(instruction.who, "add")} ${instruction.colors?.join("") ?? `${instruction.any} of any one color`}${gate}.`;
		case "modify": return `${what} gets ${changed(instruction.change)} ${instruction.until === "indefinite" ? "indefinitely" : `until ${instruction.until.replace(/-/g, " ")}`}${gate}.`;
		default: return `${instruction.do}${what ? ` ${what}` : ""}${gate}.`;
	}
}

const MAIN = ["precombat-main", "postcombat-main"];
/** A sorcery-speed action or a land play needs this seat's main phase and an empty stack. */
export const mainWindow = (frame: Frame) => frame.view.window.kind === "turn" && frame.view.window.active === frame.seat &&
	MAIN.includes(frame.view.window.step) && !frame.view.objects?.some((object) => object.zone === "stack");

/** Every way to choose `count` of `items`, or fewer down to `least`. */
export function subsets<T>(items: T[], most: number, least = most): T[][] {
	const found: T[][] = [];
	const walk = (from: number, chosen: T[]) => {
		if (chosen.length >= least) found.push(chosen);
		if (chosen.length === most) return;
		for (let at = from; at < items.length; at++) walk(at + 1, [...chosen, items[at]!]);
	};
	walk(0, []);
	return found;
}

const ref = (object: Seen): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
const name = (object: Seen) => object.card ?? object.token?.name ?? object.id;

/** Each target slot as an option shows it, then any choice that conflicts with hexproof. One wording for spells, abilities and triggers. */
export function aiming(targets: Chosen[][], world: World, controller: SeatId): string[] {
	const named = (chosen: Chosen) => { if ("player" in chosen) {
		const role = chosen.player === controller ? "you" : "opponent", player = world.players.find((one) => one.id === chosen.player)?.name;
		return player ? `player ${player} (seat ${chosen.player}, ${role})` : `player ${role} (seat ${chosen.player})`;
	} const object = world.lastKnown(chosen)?.object; return `${object ? name(object) : chosen.id} (${chosen.id}@${chosen.incarnation})`; };
	const marks = targetConflicts(targets.flat(), world, controller).map((one) => one.reason);
	return [...targets.map((set, at) => `Target ${at + 1}: ${set.length ? set.map(named).join(", ") : "none"}.`), ...marks];
}

/** Registered target restrictions guide announcement and resolution without hiding physical continuations. */
export function targetConflicts(targets: Chosen[], world: World, controller: SeatId) {
	return targets.flatMap((target) => {
		const object = "id" in target ? world.lastKnown(target)?.object : undefined;
		return object && object.controller !== controller && world.read(object)?.words.includes("hexproof")
			? [{ target, reason: `${name(object)} (${object.id}@${object.incarnation}) conflicts with hexproof.` }] : [];
	});
}

/** The objects and players each slot could take now, before counting. */
function candidates(slot: Target, scope: Scope): Chosen[] {
	const seats = slot.player === undefined ? [] : slot.player === "any" ? scope.world.players.map((one) => one.id) : players(scope, slot.player);
	return [...(slot.object ? scope.world.objects.filter((object) => matches(scope, object, slot.object!)).map(ref) : []), ...seats.map((player) => ({ player }))];
}

/** Every way to fill the slots, each chosen with the earlier slots in scope: "Equipment attached to that creature". */
export const targetings = (slots: Target[], scope: Scope): Chosen[][][] => slots.reduce<Chosen[][][]>((sets, slot) => sets.flatMap((set) =>
	subsets(candidates(slot, { ...scope, targets: set }), slot.count ?? 1, slot.upTo ? 0 : slot.count ?? 1).map((option) => [...set, option])), [[]]);

/** The extra costs a procedure states, as each way they can be paid. */
type Way = { paid: Omit<Paid, "generic" | "colors">; uses: string[]; consumes?: string[]; shows: string };
function extras(procedure: Procedure, scope: Scope, source: SeenObject, frame: Frame): Way[] {
	const cost = procedure.cost ?? {};
	let ways: Way[] = [{ paid: {}, uses: [], consumes: [], shows: "" }];
	// One object pays one part. The source alone may be tapped and also leave once:
	// "{T}, Sacrifice this" is one object paying two parts; sacrificing and exiling it is not.
	const add = (options: Way[]) => {
		ways = ways.flatMap((way) => options.filter((option) => !(option.consumes ?? []).some((id) => way.consumes!.includes(id)) &&
			!option.uses.some((id) => id !== source.id && way.uses.includes(id)))
			.map((option) => ({ paid: { ...way.paid, ...option.paid }, uses: [...new Set([...way.uses, ...option.uses])], consumes: [...way.consumes!, ...(option.consumes ?? [])],
				shows: `${way.shows}${option.shows}` })));
	};
	if (cost.tap === true) {
		if (source.zone !== "battlefield" || source.tapped || sick(frame, source)) return [];
		add([{ paid: { tap: true }, uses: [source.id], shows: "Tap the source. " }]);
	} else if (cost.tap) {
		const crew = cost.tap;
		const able = query({ zones: ["battlefield"], controller: "self", tapped: false }, frame).filter((one) => matches(scope, one, crew.choose));
		const enough = (chosen: SeenObject[]) => (crew.count === undefined || chosen.length >= crew.count) &&
			(crew.totalPower === undefined || chosen.reduce((sum, one) => sum + (one.traits?.power ?? 0), 0) >= crew.totalPower);
		// Only the smallest sets that pay: a larger one taps something for nothing.
		const sets = subsets(able, able.length, 1).filter((set) => enough(set) && set.every((_, at) => !enough(set.filter((__, other) => other !== at))));
		add(sets.map((set) => ({ paid: { tapped: set.map(ref) }, uses: set.map((one) => one.id), shows: `Tap ${set.map(name).join(", ")}. ` })));
	}
	const sacrifice = cost.sacrifice;
	if (sacrifice) {
		const chosen = typeof sacrifice === "object" && "choose" in sacrifice ? sacrifice : undefined;
		const pool = chosen ? query({ zones: ["battlefield"], controller: "self" }, frame).filter((one) => matches(scope, one, chosen.choose))
			: objects(scope, sacrifice as Exclude<typeof sacrifice, { choose: unknown }>).filter((one) => one.zone === "battlefield" && one.controller === frame.seat);
		add(subsets(pool, chosen?.count ?? 1).map((set) => ({ paid: { sacrificed: set.map(ref) }, uses: set.map((one) => one.id), consumes: set.map((one) => one.id), shows: `Sacrifice ${set.map(name).join(", ")}. ` })));
	}
	if (cost.exile) add(objects(scope, cost.exile).map((one) => ({ paid: { exiled: [ref(one)] }, uses: [one.id], consumes: [one.id], shows: `Exile ${name(one)}. ` })));
	if (cost.life !== undefined) add((frame.view.players?.find((one) => one.id === frame.seat)?.life ?? 0) >= cost.life ? [{ paid: { life: cost.life }, uses: [], shows: `Pay ${cost.life} life. ` }] : []);
	if (cost.discard !== undefined) {
		const hand = query({ zones: ["hand"], controller: "self" }, frame).filter((one) => one.id !== (procedure.timing === "spell" ? source.id : ""));
		const sets = typeof cost.discard === "number" ? subsets(hand, cost.discard) : [objects(scope, cost.discard).filter((one) => one.zone === "hand")];
		add(sets.filter((set) => set.length).map((set) => ({ paid: { discarded: set.map(ref) }, uses: set.map((one) => one.id), consumes: set.map((one) => one.id), shows: `Discard ${set.map(name).join(", ")}. ` })));
	}
	if (cost.counters) add((source.counters[cost.counters.kind] ?? 0) >= cost.counters.count ? [{ paid: { counters: cost.counters }, uses: [], shows: `Remove ${cost.counters.count} ${cost.counters.kind}. ` }] : []);
	return ways;
}

/** Every source, X, cost, payment and target this seat could announce for one procedure now. */
export function offers(procedure: Procedure, frame: Frame, prefix: string): ProcedureOption[] {
	const world = viewWorld(frame.view), printed = frame.view.printed ?? {};
	const seen = new Set<string>();
	const sources = useSources(frame, procedure).filter((source) =>
		!seen.has(sameness(frame, source)) && !!seen.add(sameness(frame, source)));
	const offered: ProcedureOption[] = [];
	for (const source of sources) {
		const scope: Scope = { world, controller: frame.seat, source };
		// Timing: a spell's from its type line unless it claims flash; an activation's own restriction.
		const instant = procedure.timing === "spell" && (source.traits?.types.includes("instant") || procedure.speed === "instant" || flashed(world, frame.seat, source));
		if (procedure.timing === "spell" && !instant && !mainWindow(frame)) continue;
		// Targets belong to an Aura spell, or to the permanent's abilities once it is on the battlefield.
		if (procedure.timing === "spell" && procedure.targets?.length && source.traits && targetless(source.traits.types, source.traits.subtypes)) continue;
		if (procedure.timing === "land" && (!mainWindow(frame) || (frame.view.landsPlayed ?? 0) >= allowance(world, frame.seat).lands)) continue;
		if (procedure.timing !== "spell" && procedure.speed === "sorcery" && !mainWindow(frame)) continue;
		if (procedure.if && !holds(scope, procedure.if)) continue;
		if (procedure.limit === "once-per-turn" && world.history.some((event) => event.kind === "activated" && event.source.id === source.id &&
			event.source.incarnation === source.incarnation && event.basis === procedure.basis)) continue;
		// The mana: stated, or printed for a spell; reduced, never below zero (601.2f).
		const stated = procedure.cost?.mana ?? (procedure.timing === "spell" ? printed[source.card ?? ""]?.mana : undefined);
		const mana = stated === undefined || stated === "" ? { generic: 0, colors: [], x: 0 } : symbols(stated);
		if (!mana) continue;
		const reduce = procedure.cost?.reduce ? amount(scope, procedure.cost.reduce) : 0;
		// X runs to what this seat could make plus what is reduced; funding decides which X it can pay.
		const xs = mana.x ? Array.from({ length: Math.max(0, capacity(frame) + reduce - mana.colors.length) + 1 }, (_, at) => at) : [0];
		const aims = targetings(procedure.targets ?? [], scope);
		// Mana pays for the spell as it will be on the stack, or for the ability.
		const spending = procedure.timing === "spell" ? { ...source, zone: "stack" as const } : source;
		for (const x of xs) {
			const price: Price = { generic: Math.max(0, mana.generic + x * mana.x - reduce), colors: mana.colors };
			for (const extra of extras(procedure, scope, source, frame)) {
				for (const { funding, shows: paying } of fundings(frame, price, new Set(extra.uses), spending)) {
					for (const targets of aims) {
						const aimed = targets.flat();
						offered.push({
							option: {
								id: `${prefix}:${source.id}@${source.incarnation}${mana.x ? `:x${x}` : ""}:${[...funding.paid, ...funding.taps.map((tap) => tap.source.id), ...extra.uses].join(",") || "free"}${targets.map((set, at) => set.length ? `:t${at}=${set.map(targetKey).join("+")}` : "").join("")}`,
								// The label names its targets, so an option says what it hits without a cross-reference.
								label: `${procedure.claim} (${name(source)})${aimed.length ? `. ${aiming(targets, world, frame.seat).slice(0, targets.length).join(" ")}` : ""}`,
								notes: targetConflicts(aimed, world, frame.seat).map((one) => one.reason),
								shows: [
									`Source: ${name(source)} (${source.id}@${source.incarnation}).`,
									procedure.timing === "land" ? "Play this land. It uses this turn's land play." :
										`Cost: ${price.generic} generic${price.colors.map((color) => ` + {${color}}`).join("")}${mana.x ? `, X=${x}` : ""}${reduce ? ` (reduced by ${reduce})` : ""}. ${extra.shows}${paying}`,
									procedure.timing === "mana" ? "Resolves immediately." : procedure.timing === "spell" ? "Cast this card onto the stack." : procedure.timing === "stack" ? "Put the ability on the stack." : "",
									...aiming(targets, world, frame.seat), ...procedure.instructions.map(summary), `Claimed basis: ${procedure.basis}`,
								].filter(Boolean).join(" "),
								objects: [ref(source), ...funding.taps.map((tap) => tap.source), ...extra.uses.filter((id) => id !== source.id).flatMap((id) => {
									const object = frame.view.objects?.find((one) => one.id === id); return object ? [ref(object)] : [];
								}), ...aimed.flatMap((chosen) => "id" in chosen ? [chosen] : [])],
							},
							activation: { source: ref(source), controller: frame.seat, claim: procedure.claim, basis: procedure.basis, timing: procedure.timing,
								...(procedure.speed ? { speed: procedure.speed } : {}),
								cost: { generic: price.generic, colors: [...price.colors], ...structuredClone(extra.paid) }, paid: funding.paid,
								...(funding.taps.length ? { funding: structuredClone(funding.taps) } : {}),
								targets, slots: structuredClone(procedure.targets ?? []), instructions: structuredClone(procedure.instructions),
								...(procedure.words ? { words: [...procedure.words] } : {}), ...(mana.x ? { x } : {}) },
						});
					}
				}
			}
		}
	}
	return offered.map(({ option, activation }) => ({ option: { ...option, use: structuredClone(activation) }, activation }));
}
