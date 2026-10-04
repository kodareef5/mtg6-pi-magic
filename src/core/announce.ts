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
import { select as query } from "./agenda.ts";
import { capacity, fundings, sameness, sick, type Price } from "./funding.ts";
import { amount, holds, matches, objects, players, targetKey, viewWorld, type Chosen, type Scope, type Seen } from "./selectors.ts";
import type { Instruction, Procedure, Target } from "./language.ts";
import { allowance, flashed, playable } from "./permits.ts";
import type { Activation, Mana, Paid } from "./table.ts";
import type { Frame, ObjectRef, Option } from "./types.ts";
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

/** One instruction in a few words, so every option says what it does at the same level of detail. */
export function summary(instruction: Instruction): string {
	const of = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
	const what = "what" in instruction && instruction.what ? of(instruction.what) : "every" in instruction && instruction.every ? `each ${of(instruction.every)}` : "";
	const gate = `${instruction.if ? ` if ${of(instruction.if)}` : ""}${instruction.may ? " (optional)" : ""}${instruction.as ? ` as ${instruction.as}` : ""}`;
	switch (instruction.do) {
		case "damage": return `Deal ${of(instruction.amount)} damage to ${instruction.to ? of(instruction.to) : what}${gate}.`;
		case "choose": return `${of(instruction.who)} chooses ${of(instruction.count)}${instruction.upTo ? " or fewer" : ""} of ${of(instruction.from)}${instruction.reveal ? ", revealed" : ""}${gate}.`;
		case "move": return `Put ${what} into ${instruction.to} (${instruction.reason})${instruction.tapped ? " tapped" : ""}${gate}.`;
		case "draw": case "mill": case "shuffle": return `${of(instruction.who)} ${instruction.do}s${"count" in instruction ? ` ${of(instruction.count)}` : ""}${gate}.`;
		case "life": return `${of(instruction.who)} changes life by ${of(instruction.amount)}${gate}.`;
		case "counters": return `Put ${of(instruction.amount)} ${instruction.kind} counters on ${instruction.on ? of(instruction.on) : what}${gate}.`;
		case "mana": return `${of(instruction.who)} adds ${instruction.colors?.join("") ?? `${instruction.any} of any one color`}${gate}.`;
		case "modify": return `${what} gets ${of(instruction.change)} until ${instruction.until}${gate}.`;
		default: return `${instruction.do} ${what}${gate}.`;
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
const label = (chosen: Chosen, frame: Frame) => "player" in chosen ? `seat ${chosen.player}` :
	`${name(frame.view.objects!.find((one) => one.id === chosen.id)!)} (${chosen.id}@${chosen.incarnation})`;

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
	const fromHand = procedure.timing === "spell" || procedure.timing === "land";
	const zones = procedure.source.zones ?? [fromHand ? "hand" : "battlefield"];
	const seen = new Set<string>();
	const sources = query(procedure.source, frame).filter((source) => (source.card || source.token) && zones.includes(source.zone as never) &&
		(source.zone === "battlefield" || source.zone === "stack" ? source.controller : source.owner) === frame.seat &&
		!seen.has(sameness(frame, source)) && !!seen.add(sameness(frame, source)));
	const offered: ProcedureOption[] = [];
	for (const source of sources) {
		const scope: Scope = { world, controller: frame.seat, source };
		// Timing: a spell's from its type line unless it claims flash; an activation's own restriction.
		const instant = procedure.timing === "spell" && (source.traits?.types.includes("instant") || procedure.speed === "instant" || flashed(world, frame.seat, source));
		if (procedure.timing === "spell" && !instant && !mainWindow(frame)) continue;
		if (procedure.timing === "land" && (!mainWindow(frame) || (frame.view.landsPlayed ?? 0) >= allowance(world, frame.seat).lands)) continue;
		// A card is played from hand unless a permission says otherwise.
		if (fromHand && !playable(world, frame.seat, source, frame.view.window.kind === "turn" ? frame.view.window.turn : 0, procedure.timing === "land")) continue;
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
						const marks = aimed.flatMap((chosen) => {
							const object = "id" in chosen ? frame.view.objects?.find((one) => one.id === chosen.id) : undefined;
							return object && object.controller !== frame.seat && object.traits?.words.includes("hexproof") ? [`${label(chosen, frame)} conflicts with hexproof.`] : [];
						});
						offered.push({
							option: {
								id: `${prefix}:${source.id}@${source.incarnation}${mana.x ? `:x${x}` : ""}:${[...funding.paid, ...funding.taps.map((tap) => tap.source.id), ...extra.uses].join(",") || "free"}${targets.map((set, at) => set.length ? `:t${at}=${set.map(targetKey).join("+")}` : "").join("")}`,
								label: `${procedure.claim} (${name(source)})`,
								shows: [
									`Source: ${name(source)} (${source.id}@${source.incarnation}).`,
									procedure.timing === "land" ? "Play this land. It uses this turn's land play." :
										`Cost: ${price.generic} generic${price.colors.map((color) => ` + {${color}}`).join("")}${mana.x ? `, X=${x}` : ""}${reduce ? ` (reduced by ${reduce})` : ""}. ${extra.shows}${paying}`,
									procedure.timing === "mana" ? "Resolves immediately." : procedure.timing === "spell" ? "Cast this card onto the stack." : procedure.timing === "stack" ? "Put the ability on the stack." : "",
									...targets.map((set, at) => `Target ${at + 1}: ${set.length ? set.map((one) => label(one, frame)).join(", ") : "none"}.`),
									...marks, ...procedure.instructions.map(summary), `Claimed basis: ${procedure.basis}`,
								].filter(Boolean).join(" "),
								objects: [ref(source), ...funding.taps.map((tap) => tap.source), ...aimed.flatMap((chosen) => "id" in chosen ? [chosen] : [])],
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
	return offered;
}
