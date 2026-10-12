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
import { targetChoiceKey, targetings } from "./targeting.ts";
export { targetCandidates, targetings } from "./targeting.ts";
import { doubleFaced, faceFacts } from "./faces.ts";
import { spellCharacteristics } from "./characteristics.ts";
import { castWords } from "./cast-words.ts";
import { enoughExile } from "./cost-selection.ts";
import { targetless } from "./printed.ts";
import { select as query } from "./query.ts";
import { capacity, fundings, outputKey, sameness, sick, spentWords, tapObjects, type Price, type Funding } from "./funding.ts";
import { amount, holds, matches, objects, targetKey, viewWorld, type Chosen, type Scope, type Seen, type World } from "./selectors.ts";
import type { Instruction, Procedure } from "./language.ts";
import { allowance, activationRestrictions, castingPrices, castRestrictions, flashed, permissionMana } from "./permits.ts";
import { useSources } from "./readiness.ts";
import { instantLoyalty, loyaltyUsed } from "./activated.ts";
import { maximumReduction, costAction, costAdjustment, hasLifeCosts } from "./casting-costs.ts";
import type { Activation, Paid } from "./table.ts";
import type { Frame, ObjectRef, Option, SeatId } from "./types.ts";
import type { SeenObject } from "./work.ts";
import { manaChoices } from "./mana-cost.ts";
import { tapsSource, tapChoices } from "./tap-costs.ts";
import { subsets } from "./subsets.ts";
import { sacrificePool, variableSacrifice } from "./sacrifice-costs.ts";
export { subsets } from "./subsets.ts";
export { symbols } from "./mana-cost.ts";

export type ProcedureOption = { option: Option; activation: Activation };

/** Offer terms can be shared across payments, but never changed through another
 * option. Callers' equipment is cloned before it enters these snapshots. */
export function immutable<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const part of Object.values(value)) immutable(part);
		Object.freeze(value);
	}
	return value;
}

/** Plain words for simple accepted terms, exact terms for shapes the prose does not cover. */
function words(value: unknown, as: "thing" | "amount" | "condition" = "thing"): string {
	if (typeof value === "number") return String(value);
	if (typeof value === "string") {
		const target = /^target:(\d+)$/.exec(value);
		if (value.startsWith("source:")) return `the source of ${words(value.slice(7))}`;
		return target ? `target ${Number(target[1]) + 1}` : value.startsWith("bound:") ? `the chosen ${value.slice(6)}` : value === "event:object" ? "that object" : value;
	}
	if (!value || typeof value !== "object") return JSON.stringify(value);
	const one = value as Record<string, unknown>;
	if (as === "condition") {
		if ("amount" in one) return `${words(one.amount, "amount")} is ${[one.atLeast !== undefined ? `at least ${one.atLeast}` : "", one.atMost !== undefined ? `at most ${one.atMost}` : ""].filter(Boolean).join(" and ") || "unbounded"}`;
		if ("bound" in one) return `a ${one.bound} was chosen`;
		if ("not" in one) return `not (${words(one.not, "condition")})`;
		return JSON.stringify(one);
	}
	if (as === "amount") {
		if ("divided" in one) return `the share assigned to each target in group ${Number(one.divided) + 1}`;
		if ("count" in one) return `the number of ${words(one.count)}`;
		if ("power" in one) return `the power of ${words(one.power)}`;
		if ("toughness" in one) return `the toughness of ${words(one.toughness)}`;
		if ("counters" in one) return `the number of ${one.counters} counters on ${words(one.on)}`;
		if ("life" in one) return one.life === "you" || one.life === "self" ? "your life" : `${words(one.life)}'s life`;
		return JSON.stringify(one);
	}
	// Prose covers these selector fields completely. Others retain their exact restrictions.
	if (Object.keys(one).some((key) => !["name", "zones", "controller", "owner", "types", "subtypes", "supertypes"].includes(key))) return JSON.stringify(one);
	const list = (key: string) => Array.isArray(one[key]) ? (one[key] as string[]) : [];
	const zones = list("zones");
	const kind = ["supertypes", "subtypes", "types"].map((key) => list(key).join(" or ")).filter(Boolean).join(" ") || (zones.length && !zones.includes("battlefield") ? "card" : "permanent");
	if (!one.name && !(one.owner && one.controller) && !(one.owner && (!zones.length || zones.includes("battlefield") || zones.includes("stack")))) {
		const side = one.controller ?? one.owner, possessive = side === "you" || side === "self" ? "your " : side === "opponent" ? "opponent's " : "";
		if (side === undefined || possessive) return zones.length ? `${kind} (${possessive}${zones.join(" or ")})` : `${kind}${possessive ? side === "opponent" ? " an opponent controls" : " you control" : ""}`;
	}
	const scope = [zones.length ? zones.join(" or ") : "battlefield", one.controller ? `controlled by ${words(one.controller)}` : "", one.owner ? `owned by ${words(one.owner)}` : "", one.name ? `named ${one.name}` : ""].filter(Boolean);
	return `${kind} (${scope.join("; ")})`;
}

/** A characteristic change in plain words. */
function changed(change: unknown): string {
	if (!change || typeof change !== "object") return "changes";
	const one = change as Record<string, unknown>, parts: string[] = [];
	if (Object.keys(one).some((key) => !["power", "toughness", "base", "words"].includes(key))) return JSON.stringify(one);
	const delta = (value: unknown) => typeof value === "number" ? `${value < 0 ? "" : "+"}${value}` : `+(${words(value, "amount")})`;
	if (one.power !== undefined || one.toughness !== undefined) parts.push(`${delta(one.power ?? 0)}/${delta(one.toughness ?? 0)}`);
	const base = one.base as { power: unknown; toughness: unknown } | undefined;
	if (base) parts.push(`base ${words(base.power, "amount")}/${words(base.toughness, "amount")}`);
	if (Array.isArray(one.words) && one.words.length) parts.push(`gains ${(one.words as string[]).join(", ")}`);
	return parts.join(", ") || JSON.stringify(one);
}

/** One instruction in a few words, so every option says what it does at the same level of detail. */
export function summary(instruction: Instruction): string {
	const rendered: Record<string, string[]> = { damage: ["to", "every", "amount"], choose: ["who", "from", "count", "upTo", "reveal"],
		"choose-actions": ["who", "count", "actions"],
		move: ["what", "every", "to", "reason", "tapped"], draw: ["who", "count"], mill: ["who", "count"], shuffle: ["who"],
		life: ["who", "amount"], counters: ["on", "every", "kind", "amount"], mana: ["who", "colors", "any"],
		modify: ["what", "every", "change", "until"], tap: ["what", "every"], untap: ["what", "every"], destroy: ["what", "every"] };
	if (!rendered[instruction.do] || instruction.do === "mana" && instruction.colors && instruction.any || Object.keys(instruction).some((key) => !["do", "if", "may", "as", ...rendered[instruction.do]!].includes(key))) return `Accepted instruction: ${JSON.stringify(instruction)}`;
	const of = (value: unknown) => words(value);
	const who = (value: unknown, verb: string) => value === "you" ? `you ${verb}` : `${of(value)} ${verb}s`;
	const what = "what" in instruction && instruction.what ? of(instruction.what) : "every" in instruction && instruction.every ? `each ${of(instruction.every)}` : "";
	const gate = `${instruction.if ? ` if ${words(instruction.if, "condition")}` : ""}${instruction.may ? " (optional)" : ""}${instruction.as ? ` as ${instruction.as}` : ""}`;
	switch (instruction.do) {
		case "damage": return `Deal ${words(instruction.amount, "amount")} damage to ${instruction.to ? of(instruction.to) : what}${gate}.`;
		case "choose": return `${who(instruction.who, "choose")} ${instruction.upTo ? "up to " : ""}${words(instruction.count, "amount")} ${of(instruction.from)}${instruction.reveal ? ", revealed" : ""}${gate}.`;
		case "choose-actions": return `${who(instruction.who, "choose")} ${words(instruction.count, "amount")} actions: ${instruction.actions.map(action => "loseLife" in action ? `lose ${action.loseLife} life` : "discard" in action ? "discard a card" : `sacrifice ${of(action.sacrifice)}`).join(" or ")}. Carry out all choices simultaneously${gate}.`;
		case "move": return `Put ${what} into ${instruction.to} (${instruction.reason})${instruction.tapped ? " tapped" : ""}${gate}.`;
		case "draw": case "mill": case "shuffle": return `${who(instruction.who, instruction.do)}${"count" in instruction ? ` ${words(instruction.count, "amount")}` : ""}${gate}.`;
		case "increase-speed": return `${of(instruction.who)} increases speed by ${instruction.amount}${gate}.`;
		case "life": return `${of(instruction.who)} changes life by ${words(instruction.amount, "amount")}${gate}.`;
		case "counters": return `Put ${words(instruction.amount, "amount")} ${instruction.kind} counters on ${instruction.on ? of(instruction.on) : what}${gate}.`;
		case "mana": return `${who(instruction.who, "add")} ${instruction.colors?.join("") ?? `${instruction.any} of any one color`}${instruction.until ? `, lasting until ${instruction.until.replaceAll("-", " ")}` : ""}${gate}.`;
		case "modify": return `${what} gets ${changed(instruction.change)} ${instruction.until === "indefinite" ? "indefinitely" : `until ${instruction.until.replace(/-/g, " ")}`}${gate}.`;
		default: return `${instruction.do}${what ? ` ${what}` : ""}${gate}.`;
	}
}

const MAIN = ["precombat-main", "postcombat-main"];
/** A sorcery-speed action or a land play needs this seat's main phase and an empty stack. */
export const mainWindow = (frame: Frame) => frame.view.window.kind === "turn" && frame.view.window.active === frame.seat &&
	MAIN.includes(frame.view.window.step) && !frame.view.objects?.some((object) => object.zone === "stack");

const ref = (object: Seen): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
const name = (object: Seen) => object.faceDown ? `Face-down object (${object.id})` : object.card ?? object.token?.name ?? object.copied?.spec.name ?? object.id;

/** Each target slot as an option shows it, then any choice that conflicts with hexproof. One wording for spells, abilities and triggers. */
export function aiming(targets: Chosen[][], world: World, controller: SeatId): string[] {
	const named = (chosen: Chosen) => { if ("player" in chosen) {
		const role = chosen.player === controller ? "you" : "opponent", player = world.players.find((one) => one.id === chosen.player)?.name;
		return player ? `player ${player} (seat ${chosen.player}, ${role})` : `player ${role} (seat ${chosen.player})`;
	} const known = world.lastKnown(chosen), object = known?.object, traits = known?.traits ?? (object ? world.read(object) : undefined);
		// Whose it is and its body now, so a target reads as what it is without a cross-reference.
		const facts = [`${chosen.id}@${chosen.incarnation}`, ...(object ? [object.controller === controller ? "yours" : "opponent's"] : []),
			...(traits?.types.includes("creature") && traits.power !== undefined ? [`${traits.power}/${traits.toughness}`] : [])];
		return `${object ? name(object) : chosen.id} (${facts.join(", ")})`; };
	const marks = targetConflicts(targets.flat(), world, controller).map((one) => one.reason);
	return [...targets.map((set, at) => `Target ${at + 1}: ${set.length ? set.map(one => `${named(one)}${one.amount === undefined ? "" : `: assigned ${one.amount}`}`).join(", ") : "none"}.`), ...marks];
}

/** Registered target restrictions guide announcement and resolution without hiding physical continuations. */
export function targetConflicts(targets: Chosen[], world: World, controller: SeatId) {
	return targets.flatMap((target) => {
		const object = "id" in target ? world.lastKnown(target)?.object : undefined;
		return object && object.controller !== controller && world.read(object)?.words.includes("hexproof")
			? [{ target, reason: `${name(object)} (${object.id}@${object.incarnation}) conflicts with hexproof.` }] : [];
	});
}

/** The extra costs a procedure states, as each way they can be paid. */
type Way = { paid: Omit<Paid, "generic" | "colors">; uses: string[]; consumes?: string[]; shows: string; reduce?: number; exileSelection?: Activation["exileSelection"] };
export function extras(procedure: Procedure, scope: Scope, source: SeenObject, frame: Frame, sacrifices?: ObjectRef[]): Way[] {
	const cost = procedure.cost ?? {};
	if (cost.loyalty !== undefined && cost.counters?.kind === "loyalty") return [];
	let ways: Way[] = [{ paid: {}, uses: [], consumes: [], shows: "" }];
	// One object pays one part. The source alone may be tapped and also leave once:
	// "{T}, Sacrifice this" is one object paying two parts; sacrificing and exiling it is not.
	const add = (options: Way[]) => {
		ways = ways.flatMap((way) => options.filter((option) => !(option.consumes ?? []).some((id) => way.consumes!.includes(id)) &&
			!option.uses.some((id) => id !== source.id && way.uses.includes(id)))
			.map((option) => ({ paid: { ...way.paid, ...option.paid }, uses: [...new Set([...way.uses, ...option.uses])], consumes: [...way.consumes!, ...(option.consumes ?? [])],
				...(option.exileSelection ?? way.exileSelection ? { exileSelection: option.exileSelection ?? way.exileSelection } : {}),
				...(option.reduce || way.reduce ? { reduce: (option.reduce ?? 0) + (way.reduce ?? 0) } : {}),
				shows: `${way.shows}${option.shows}` })));
	};
	if (cost.loyalty !== undefined) {
		if (source.zone !== "battlefield" || (source.counters.loyalty ?? 0) + cost.loyalty < 0) return [];
		add([{ paid: { loyalty: cost.loyalty }, uses: [], shows: `${cost.loyalty >= 0 ? "+" : ""}${cost.loyalty} loyalty. ` }]);
	}
	if (tapsSource(cost)) {
		if (source.zone !== "battlefield" || source.tapped || sick(frame, source)) return [];
		add([{ paid: { tap: true }, uses: [source.id], shows: "Tap the source. " }]);
	}
	if (typeof cost.tap === "object") {
		const crew = cost.tap;
		const sets = tapChoices(scope, crew);
		add(sets.map((set) => ({ paid: { tapped: set.map(ref) }, uses: set.map((one) => one.id),
			...(crew.reduce ? { reduce: Math.max(0, set.reduce((sum, one) => sum + (scope.world.read(one)?.power ?? 0), 0)) } : {}),
			shows: set.length ? `Tap ${set.map(name).join(", ")}. ` : "Tap no permanents. " })));
	}
	for (const kind of ["sacrifice", "return"] as const) {
		const payment = cost[kind];
		if (!payment) continue;
		if (typeof payment === "object" && "any" in payment) {
			if (!sacrifices || new Set(sacrifices.map(one => one.id)).size !== sacrifices.length) return [];
			const pool = sacrificePool(scope, cost), chosen = sacrifices.map(ref => pool.find(one => one.id === ref.id && one.incarnation === ref.incarnation));
			if (chosen.some(one => !one)) return [];
			add([{ paid: { sacrificed: sacrifices, sacrificeReduction: sacrifices.length * payment.reduce }, uses: sacrifices.map(one => one.id), consumes: sacrifices.map(one => one.id),
				reduce: sacrifices.length * payment.reduce, shows: chosen.length ? `Sacrifice ${chosen.map(one => name(one!)).join(", ")}; reduce generic mana by ${chosen.length * payment.reduce}. ` : "Sacrifice no permanents. " }]);
			continue;
		}
		const chosen = typeof payment === "object" && "choose" in payment ? payment : undefined;
		const pool = chosen ? query({ zones: ["battlefield"], controller: "self" }, frame).filter((one) => matches(scope, one, chosen.choose))
			: objects(scope, payment as Exclude<typeof payment, { choose: unknown }>).filter((one) => one.zone === "battlefield" && one.controller === frame.seat);
		add(subsets(pool, chosen?.count ?? 1).map((set) => ({ paid: kind === "sacrifice" ? { sacrificed: set.map(ref) } : { returned: set.map(ref) },
			uses: set.map((one) => one.id), consumes: set.map((one) => one.id),
			shows: kind === "sacrifice" ? `Sacrifice ${set.map(name).join(", ")}. ` : `Return ${set.map(name).join(", ")} to ${set.length === 1 ? "its owner's hand" : "their owners' hands"}. ` })));
	}
	if (typeof cost.exile === "object" && "graveyard" in cost.exile) {
		if (!enoughExile(scope, cost.exile)) return [];
		add([{ paid: {}, uses: [], exileSelection: cost.exile, shows: `Select own graveyard cards with total mana value at least ${cost.exile.totalManaValue} before paying. ` }]);
	} else if (cost.exile) {
		const chosen = typeof cost.exile === "object" && "choose" in cost.exile ? cost.exile : undefined;
		const pool = chosen ? scope.world.objects.filter((one) => (one.zone === "battlefield" ? one.controller === frame.seat : one.zone === "graveyard" && one.owner === frame.seat) &&
			(!chosen.source || one.id !== source.id) && matches(scope, one, chosen.choose)) : objects(scope, cost.exile as Exclude<typeof cost.exile, { choose: unknown }>);
		const sets = subsets(pool, chosen?.count ?? 1).map((set) => chosen?.source ? [source, ...set] : set);
		add(sets.map((set) => ({ paid: { exiled: set.map(ref) }, uses: set.map((one) => one.id), consumes: set.map((one) => one.id), shows: `Exile ${set.map(name).join(", ")}. ` })));
	}
	if (cost.life !== undefined) add((frame.view.players?.find((one) => one.id === frame.seat)?.life ?? 0) >= cost.life ? [{ paid: { life: cost.life }, uses: [], shows: `Pay ${cost.life} life. ` }] : []);
	if (cost.discard !== undefined) {
		const hand = query({ zones: ["hand"], controller: "self" }, frame).filter((one) => one.id !== (procedure.timing === "spell" ? source.id : ""));
		const sets = typeof cost.discard === "number" ? subsets(hand, cost.discard) : [objects(scope, cost.discard).filter((one) => one.zone === "hand")];
		add(sets.filter((set) => set.length).map((set) => ({ paid: { discarded: set.map(ref) }, uses: set.map((one) => one.id), consumes: set.map((one) => one.id), shows: `Discard ${set.map(name).join(", ")}. ` })));
	}
	if (cost.counters) {
		const { kind, count, on, put } = cost.counters;
		const pool = on ? query({ zones: ["battlefield"], controller: "self" }, frame).filter((one) => matches(scope, one, on.choose))
			: source.zone === "battlefield" ? [source] : [];
		const sets = subsets(pool.filter((one) => put || (one.counters[kind] ?? 0) >= count), on?.count ?? 1);
		add(sets.map((set) => ({ paid: { counters: { kind, count, ...(put ? { put } : {}), ...(on ? { on: set.map(ref) } : {}) } }, uses: [],
			shows: `${put ? "Put" : "Remove"} ${count} ${kind} ${put ? "on" : "from"} each of ${set.map(name).join(", ")}. ` })));
	}
	if (cost.show) {
		const pool = query({ zones: ["hand", "battlefield"], controller: "self" }, frame).filter((one) => matches(scope, one, cost.show!.choose));
		add(subsets(pool, cost.show.count).map((set) => ({ paid: { shown: set.map((one) => ({ ...ref(one), ...(one.zone === "hand" ? { reveal: true as const } : {}) })) }, uses: [],
			shows: `${set.map((one) => `${one.zone === "hand" ? "Reveal" : "Show"} ${name(one)} (${one.zone})`).join("; ")}. ` })));
	}
	return ways;
}

/** Every source, X, cost, payment and target this seat could announce now.
 * Activation terms are immutable snapshots; activation copies the selected terms. */
export function* offerBases(procedure: Procedure, frame: Frame, prefix: string) {
	procedure = immutable(structuredClone(procedure));
	const slots = procedure.targets ?? immutable([]), effects = procedure.instructions.map(summary);
	const world = viewWorld(frame.view), printed = frame.view.printed ?? {};
	if (procedure.timing === "spell" && castRestrictions(world, frame.seat).length) return;
	const seen = new Set<string>();
	const sources = useSources(frame, procedure).filter((source) =>
		!seen.has(sameness(frame, source)) && !!seen.add(sameness(frame, source)));
	for (const original of sources) {
		if (procedure.cost?.loyalty !== undefined && (!(mainWindow(frame) || instantLoyalty(world, frame.seat, original)) || original.zone !== "battlefield" || loyaltyUsed(world, original))) continue;
		if ((procedure.timing === "stack" || procedure.timing === "mana") && activationRestrictions(world, original, procedure.timing === "mana").length) continue;
		if (procedure.special === "plot" && (!mainWindow(frame) || original.zone !== "hand" || original.owner !== frame.seat)) continue;
		if (procedure.special === "turn-face-up" && (!original.manifested || !original.faceDown || original.zone !== "battlefield" || original.controller !== frame.seat)) continue;
		const selected = procedure.timing === "spell" ? faceFacts(printed[original.card ?? ""], procedure.face ?? 0) : undefined;
		const source = selected ? { ...original, faceDown: false, traits: spellCharacteristics(frame.view, original, frame.seat, procedure.face), ...(procedure.face !== undefined ? { face: procedure.face } : {}) } : original;
		const sourceRef = immutable(ref(source));
		const scope: Scope = { world, controller: frame.seat, source };
		// Timing: a spell's from its type line unless it claims flash; an activation's own restriction.
		const instant = procedure.timing === "spell" && (source.traits?.types.includes("instant") || procedure.speed === "instant" || flashed(world, frame.seat, source));
		if (procedure.timing === "spell" && !instant && !mainWindow(frame)) continue;
		// Targets belong to an Aura spell, or to the permanent's abilities once it is on the battlefield.
		if (procedure.timing === "spell" && procedure.targets?.length && source.traits && targetless(source.traits.types, source.traits.subtypes)) continue;
		if (procedure.timing === "land" && (!mainWindow(frame) || (frame.view.landsPlayed ?? 0) >= allowance(world, frame.seat).lands)) continue;
		if (procedure.timing !== "spell" && procedure.speed === "sorcery" && !mainWindow(frame)) continue;
		if (procedure.limit === "once-per-turn" && world.history.some((event) => event.kind === "activated" && event.source.id === source.id &&
			event.source.incarnation === source.incarnation && event.basis === procedure.basis)) continue;
		// The mana: stated, or printed for a spell; reduced, never below zero (601.2f).
		const turn = frame.view.window.kind === "turn" ? frame.view.window.turn : 0;
		const prices = procedure.timing === "spell" ? castingPrices(world, frame.seat, original, turn, procedure.face,
			procedure.cost?.mana !== selected?.mana ? procedure.cost?.mana : undefined, procedure.cost?.alternative) : [{}];
		for (const granted of prices) {
			if (granted.speed === "sorcery" && !mainWindow(frame)) continue;
			if (granted.mana === "printed" && !selected?.mana) continue;
			const stated = permissionMana(granted.mana, selected?.mana) ?? procedure.cost?.mana ?? (procedure.timing === "spell" ? selected?.mana : undefined);
			const manaText = (stated ?? "") + (procedure.cost?.additional ?? []).map((one) => one.mana).join("");
			const equivalents = manaChoices(manaText);
			for (const [hybrid, mana] of equivalents?.entries() ?? []) {
				const reduce = procedure.cost?.reduce ? amount(scope, procedure.cost.reduce) : 0;
				// A safe bound for X; exact chosen taps and payment are checked below for every candidate.
				const tapReduction = typeof procedure.cost?.tap === "object" && procedure.cost.tap.reduce ? (frame.view.objects ?? [])
					.filter((one) => one.zone === "battlefield" && one.controller === frame.seat && !one.tapped).reduce((sum, one) => sum + Math.max(0, one.traits?.power ?? 0), 0) : 0;
				// X runs to what this seat could make plus what is reduced; funding decides which X it can pay.
				const sacrificeBound = sacrificePool(scope, procedure.cost).length * (variableSacrifice(procedure.cost)?.reduce ?? 0);
				const action = costAction(procedure), standingBound = action ? maximumReduction(world, action) : 0;
				const xs = mana.x ? Array.from({ length: Math.max(0, capacity(frame) + reduce + tapReduction + sacrificeBound + standingBound - mana.colors.length) + 1 }, (_, at) => at) : [0];
				// A spell or ability goes on top of whatever waits on the stack, and so resolves before it.
				const stacked = (frame.view.objects ?? []).filter((one) => one.zone === "stack").sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
					.map((one) => `${one.controller === frame.seat ? "your" : "the opponent's"} ${one.card ?? (one.ability ? `${one.ability.claim.split(": ")[0]}'s ability` : "stack object")}`);
				// Mana pays for the spell as it will be on the stack, or for the ability.
				for (const x of xs) {
					const spending = procedure.timing === "spell" ? { ...source, controller: frame.seat, zone: "stack" as const,
						...(selected ? { traits: spellCharacteristics(frame.view, source, frame.seat, procedure.face, x, procedure.words) } : {}) } : source;
					const announced = { ...scope, source: spending, x };
					const words = [...new Set([...(procedure.words ?? []), ...(procedure.timing === "spell" ? castWords(announced, spending, spending.traits).flatMap((note) => note.words) : [])])];
					if (procedure.if && !holds(announced, procedure.if)) continue;
					yield { procedure, prefix, slots, effects, world, printed, original, source, sourceRef, selected, granted, mana, reduce, stacked, x, spending,
						...(equivalents!.length > 1 ? { hybrid, manaText } : {}),
						castFrom: procedure.timing === "spell" ? original.zone : undefined, words, scope: announced };
				}
			}
		}
	}
}

export type OfferBase = ReturnType<typeof offerBases> extends Generator<infer Basis> ? Basis : never;

/** Extra resources and the locked mana price share one calculation in both menus. */
export function offerCosts(base: OfferBase, frame: Frame, sacrifices?: ObjectRef[]) {
	const { procedure, scope, source, reduce, world, spending, original, mana, x } = base;
	const action = costAction(procedure);
	// A proposed spell already has its selected targets at 601.2f. This preview
	// supplies targeting facts only; its unpaid placeholder cost is never recorded.
	const proposed = { ...spending, ability: { source: base.sourceRef, controller: frame.seat, claim: procedure.claim, basis: procedure.basis,
		timing: procedure.timing, cost: { generic: 0, colors: [] }, paid: [], targets: scope.targets ?? [], slots: base.slots, instructions: procedure.instructions } };
	const life = action ? costAdjustment(world, proposed, original.zone, action, "life") : 0;
	const stated = life ? { ...procedure, cost: { ...procedure.cost, life: (procedure.cost?.life ?? 0) + life } } : procedure;
	return extras(stated, scope, source, frame, sacrifices).map((extra) => {
		if (life) extra.shows += `Includes ${life} life from standing costs. `;
		const reduction = reduce + (extra.reduce ?? 0) + (action ? costAdjustment(world, proposed, original.zone, action) : 0);
		const price: Price = { generic: Math.max(0, mana.generic + x * mana.x - reduction), colors: mana.colors };
		const cost = immutable({ generic: price.generic, colors: [...price.colors], ...structuredClone(extra.paid),
			...(procedure.cost?.alternative ? { alternative: procedure.cost.alternative } : {}),
			...(procedure.cost?.additional ? { additional: procedure.cost.additional.map((one) => one.name) } : {}) });
		const extraRefs = extra.uses.filter((id) => id !== source.id).flatMap((id) => {
			const object = frame.view.objects?.find((one) => one.id === id); return object ? [immutable(ref(object))] : [];
		});
		return { extra, reduction, price, cost, extraRefs };
	});
}
export type OfferCost = ReturnType<typeof offerCosts>[number];

/** Freeze the selected cost and mana sources; targets are supplied separately. */
export function paidActivation(base: OfferBase, frame: Frame, way: OfferCost, funding: Funding): Omit<Activation, "targets"> {
	const { procedure, source, sourceRef, granted, printed, slots, words, mana, x } = base, { extra, cost } = way;
	const payment = immutable(structuredClone(funding));
	const spellWords = [...new Set([...words, ...(procedure.timing === "spell" ? spentWords(funding, frame.view.pools?.find((one) => one.seat === frame.seat)?.mana ?? []) : [])])];
	return { source: sourceRef, ...(procedure.face !== undefined ? { face: procedure.face } : {}), controller: frame.seat, claim: procedure.claim, basis: procedure.basis, timing: procedure.timing,
		...(procedure.special ? { special: procedure.special } : {}),
		...(procedure.source.registered ? { registered: procedure.source.registered } : {}),
		...(extra.exileSelection ? { exileSelection: structuredClone(extra.exileSelection) } : {}),
		...(granted.permission ? { permission: granted.permission } : {}),
		...(granted.leavesStack ? { leavesStack: granted.leavesStack } : {}),
		...(procedure.timing === "stack" && doubleFaced(printed[source.card ?? ""]) ? { transformAt: source.transformed ?? 0 } : {}),
		...(extra.paid.exiled?.some((one) => one.id === source.id) ? { bound: { "cost-source": { objects: [{ id: source.id, incarnation: source.incarnation + 1 }], players: [] } } } : {}),
		...(procedure.speed ? { speed: procedure.speed } : {}), cost, paid: payment.paid,
		...(payment.taps.length ? { funding: payment.taps } : {}), slots, instructions: procedure.instructions,
		...(spellWords.length ? { words: spellWords } : {}), ...(mana.x ? { x } : {}) };
}

/** Every complete historical announcement. Staged decisions read the same bases
 * before they select targets, extra costs and individual mana sources. */
export function offers(procedure: Procedure, frame: Frame, prefix: string): ProcedureOption[] {
	const offered: ProcedureOption[] = [];
	for (const base of offerBases(procedure, frame, prefix)) {
		const { procedure, prefix, slots, effects, world, source, sourceRef, selected, granted, mana, stacked, x, spending, scope: announced } = base;
		const aims = immutable(targetings(slots, announced)).map((targets) => {
			const aimed = targets.flat(), text = aiming(targets, world, frame.seat);
			return { targets, refs: aimed.flatMap((chosen) => "id" in chosen ? [chosen] : []),
				id: targets.map((set, at) => set.length ? `:t${at}=${set.map(targetChoiceKey).join("+")}` : "").join(""),
				label: `${procedure.claim} (${selected?.name ?? name(source)})${aimed.length ? `. ${text.slice(0, targets.length).join(" ")}` : ""}`,
				notes: immutable(targetConflicts(aimed, world, frame.seat).map((one) => one.reason)),
				shows: [...text, ...effects, `Claimed basis: ${procedure.basis}`].filter(Boolean).join(" ") };
		});
		if (!aims.length) continue;
		// Preserve historical ordering when no new life term needs selected targets.
		const targeted = hasLifeCosts(world), groups = targeted ? aims.map(aim => [aim]) : [aims];
		for (const group of groups) for (const way of offerCosts(targeted ? { ...base, scope: { ...base.scope, targets: group[0]!.targets } } : base, frame)) {
			const { extra, reduction, price, extraRefs } = way;
			for (const { funding, shows: paying } of fundings(frame, { ...price, life: extra.paid.life }, new Set(extra.uses), spending, base.castFrom)) {
				const accepted = paidActivation(base, frame, way, funding), spellWords = accepted.words ?? [];
				const payment = { paid: accepted.paid, taps: accepted.funding ?? [] };
				const id = `${prefix}${procedure.face ? `:f${procedure.face}` : ""}:${source.id}@${source.incarnation}${granted.permission ? `:permit=${granted.permission}` : ""}${mana.x ? `:x${x}` : ""}${base.hybrid !== undefined ? `:h${base.hybrid}` : ""}:${[...funding.paid, ...funding.taps.map((tap) => `${tap.source.id}${outputKey(tap)}${tap.life ? `~life${tap.life}` : ""}${tap.spellWords ? `~words${tap.spellWords.map(encodeURIComponent).join("+")}` : ""}`), ...extra.uses].join(",") || "free"}${extra.paid.counters?.on ? `:counters=${extra.paid.counters.on.map(targetKey).join("+")}` : ""}${extra.paid.shown ? `:show=${extra.paid.shown.map(targetKey).join("+")}` : ""}`;
				const shows = [
					`Source: ${name(source)} (${source.id}@${source.incarnation}).`,
					granted.mana ? `Permission ${granted.permission}: cast for ${granted.mana === "printed" ? `the printed ${selected?.mana}` : `${granted.mana} instead of the mana cost`}; normal timing and additional costs still apply.${granted.leavesStack ? ` Put it into ${granted.leavesStack} whenever it leaves the stack.` : ""}` : "",
					procedure.timing === "land" ? "Play this land. It uses this turn's land play." :
						`Cost: ${price.generic} generic${price.colors.map((color) => ` + {${color}}`).join("")}${mana.x ? `, X=${x}` : ""}${reduction ? ` (reduced by ${reduction})` : ""}. ${extra.shows}${paying}`,
					procedure.timing === "mana" ? "Resolves immediately." : procedure.timing === "spell" ? "Cast this card onto the stack." : procedure.timing === "stack" ? "Put the ability on the stack." : "",
					spellWords.length ? `Spell properties: ${spellWords.join(", ")}.` : "",
					(procedure.timing === "spell" || procedure.timing === "stack") && stacked.length ? `It goes on the stack above ${stacked.join(", ")} and resolves before ${stacked.length > 1 ? "them" : "it"}.` : "",
				].filter(Boolean).join(" ");
				const spent = [sourceRef, ...payment.taps.flatMap(tapObjects), ...extraRefs, ...(extra.paid.counters?.on ?? []), ...(extra.paid.shown ?? [])];
				for (const aim of group) {
					offered.push({
						option: {
							id: `${id}${aim.id}`,
							// The label names its targets, so an option says what it hits without a cross-reference.
							label: aim.label, notes: aim.notes, shows: `${shows} ${aim.shows}`,
							objects: [...spent, ...aim.refs],
						},
						activation: { ...accepted, targets: aim.targets },
					});
				}
			}
		}
	}
	for (const one of offered) one.option.use = immutable(one.activation);
	return offered;
}
