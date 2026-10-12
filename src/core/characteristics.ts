/**
 * What an object is right now: read through the layers every time it is asked
 * for (613), never stored. The printed card or token spec is the base; continuous
 * registrations, labels with a change, and counters apply on top, by layer, then
 * sublayer, then timestamp.
 *
 * Dependency (613.8) is approximated: an effect whose source lost the ability
 * that makes it, earlier in the walk, stops applying. No card in the matchup
 * needs more. A continuous ability granted by another effect is not applied.
 * Past 150 lines because the walk and the type-line reader belong together.
 */
import { facts, manaValue, type Printed } from "./printed.ts";
import { activeFaces, currentFacts } from "./faces.ts";
import { join } from "node:path";
import { load as loadRules, rule, type Rules } from "./rules.ts";
import { type Note, type Table, type Thing } from "./table.ts";
import type { Mana } from "./table.ts";
import type { Modification, Registration } from "./language.ts";
import { amount, holds, matches, tableWorld, viewWorld, type Scope, type Seen, type World } from "./selectors.ts";
import type { SeatView } from "./types.ts";

type Color = Mana["color"];
export type Traits = {
	name: string;
	supertypes: string[];
	types: string[];
	subtypes: string[];
	/** Every creature type at once (Soulstone Sanctuary). */
	allCreatureTypes?: true;
	colors: Color[];
	manaValue?: number;
	power?: number;
	toughness?: number;
	/** Keywords and restriction words. */
	words: string[];
	/** The abilities it has now: its own unless removed, and granted ones. */
	registrations: Registration[];
	/** Derived in layer 6; separate granted abilities can still exist afterward. */
	lostAbilities?: true;
};

const SUPERTYPES = new Set(["basic", "legendary", "ongoing", "snow", "world"]);
let shippedRules: Rules | undefined;
let categories: Record<string, Set<string>> | undefined;
let creatureTypes: string[] | undefined;
let creatureNames: Set<string> | undefined;
/** Every permitted creature-type choice, including the two-word type, from the pinned 205.3m list. */
export function creatureTypeChoices(): string[] {
	shippedRules ??= loadRules(join(import.meta.dirname, "..", "..", "rules", "cr.tsv"));
	const text = rule(shippedRules, "205.3m").text;
	return creatureTypes ??= [text.match(/two words long: ([^.]+)\./)![1]!, ...text.match(/one word long: (.*)\.$/)![1]!.replace(/, and /, ", ").split(/,\s*/)].sort();
}
/** Subtypes by the card type they belong to, read from 205.3g-k in the pinned rules. */
export function subtypesOf(kind: "artifact" | "enchantment" | "land" | "planeswalker" | "spell" | "battle"): Set<string> {
	if (!categories) {
		shippedRules ??= loadRules(join(import.meta.dirname, "..", "..", "rules", "cr.tsv"));
		const rules = shippedRules;
		const listed = (ref: string) => new Set((rule(rules, ref).text.match(/types are (.*?)\.(?: Of that list|$)/)?.[1] ?? "")
			.replace(/\s*\(see rules? [^)]*\)/g, "").replace(/,? and /, ", ").split(/,\s*/).map((one) => one.trim().toLowerCase()).filter(Boolean));
		categories = { artifact: listed("205.3g"), enchantment: listed("205.3h"), land: listed("205.3i"), planeswalker: listed("205.3j"), spell: listed("205.3k"),
			battle: new Set([rule(rules, "205.3q").text.match(/type is ([^.]+)\./)![1]!.toLowerCase()]) };
	}
	return categories[kind]!;
}
/** Changeling uses the same permitted types as an entry choice. */
export const creatureType = (subtype: string) => (creatureNames ??= new Set(creatureTypeChoices().map((one) => one.toLowerCase()))).has(subtype.toLowerCase());

const BASIC: Record<string, Color> = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G" };
export const basicLandTypes = Object.keys(BASIC).map((name) => name[0]!.toUpperCase() + name.slice(1));
/** 305.6: a land with a basic land type taps for that type's color. */
export const intrinsic = (traits?: Traits): Color[] => traits?.types.includes("land") && !traits.lostAbilities
	? traits.subtypes.flatMap((subtype) => BASIC[subtype.toLowerCase()] ? [BASIC[subtype.toLowerCase()]!] : []) : [];

/** The printed card or the token spec, before any effect. */
export function base(table: Table, object: Thing): Traits | undefined {
	if (object.faceDown && object.zone === "battlefield") return { name: "", types: ["creature"], subtypes: [], supertypes: [], colors: [], manaValue: 0, power: 2, toughness: 2, words: [], registrations: registered(table, object) };
	const printedCard = object.card ? table.printed[object.card] : undefined;
	const active = printedCard ? activeFaces(printedCard, object) : [0];
	// A self characteristic with an explicit nonbattlefield scope applies there, such as changeling.
	// Its accepted source terms are journaled equipment until an entry freezes the permanent's registrations.
	const standing = object.zone !== "battlefield" && object.card ? (table.work[object.zone === "stack" ? object.ability?.controller ?? object.controller : object.owner]?.packages?.find((one) => one.card === object.card)?.registers ?? [])
		.filter((one) => one.kind === "continuous" && one.affects.is === "this" && one.affects.zones?.includes(object.zone as never) ||
			one.kind === "permit" && one.cast?.from.includes(object.zone as never) ||
			one.kind === "watch" && one.zones?.includes(object.zone as never)) : [];
	const own = [...(object.registrations ?? []), ...registered(table, object), ...standing].filter((one) => one.face === undefined || active.includes(one.face));
	if (object.token || object.zone === "battlefield" && object.copied) {
		const spec = object.zone === "battlefield" && object.copied ? object.copied.spec : object.token!;
		return { name: spec.name, supertypes: [...(spec.supertypes ?? [])], types: [...spec.types], subtypes: [...(spec.subtypes ?? [])],
			colors: [...spec.colors] as Color[], manaValue: spec.mana ? manaValue({ type: "", stats: "", text: false, oracle: "", mana: spec.mana }) : 0,
			...(spec.power !== undefined ? { power: spec.power, toughness: spec.toughness ?? 0 } : {}),
			words: [...(spec.words ?? [])], registrations: [...(spec.registers ?? []), ...own] };
	}
	const printed = facts(table, object);
	if (!printed) return undefined;
	const traits = printedTraits(printed, object.card!, own, object.zone === "stack" ? object.ability?.x ?? 0 : 0);
	if (object.zone === "stack" && object.ability?.words) traits.words = [...object.ability.words];
	// 202.3b: a transformed permanent uses its front's cost, unless it is a copy of that back face.
	if (printedCard?.layout === "transform" && object.face === 1 && !object.copy && ["battlefield", "stack"].includes(object.zone))
		traits.manaValue = manaValue({ ...printed, mana: printedCard.faces![0]!.mana }, object.zone === "stack" ? object.ability?.x ?? 0 : 0);
	return traits;
}

/** The same printed reading is used before announcement and on the stack. */
export function printedTraits(printed: Printed, name: string, own: Registration[] = [], x = 0): Traits {
	const [left, right = ""] = printed.type.split("—").map((part) => part.trim());
	const words = left!.split(/\s+/).map((word) => word.toLowerCase());
	const stats = printed.stats.match(/^(-?\d+)\/(-?\d+)$/);
	return {
		name: printed.name ?? name, supertypes: words.filter((word) => SUPERTYPES.has(word)), types: words.filter((word) => !SUPERTYPES.has(word)),
		subtypes: right ? right.split(/\s+/) : [],
		colors: printed.colors as Color[] ?? [...new Set(printed.mana.match(/[WUBRG]/g) as Color[] ?? [])],
		manaValue: manaValue(printed, x),
		...(stats ? { power: Number(stats[1]), toughness: Number(stats[2]) } : {}), words: [], registrations: own,
	};
}
const registered = (table: Table, object: Thing) => table.notes.flatMap((note) =>
	note.kind === "register" && note.on.id === object.id && note.on.incarnation === object.incarnation ? [note.registration] : []);

/** One object's characteristics now, including explicitly scoped self terms outside the battlefield. */
export function characteristics(table: Table, object: Thing): Traits | undefined {
	const real = table.things.get(object.id);
	const same = real && real.incarnation === object.incarnation && real.zone === object.zone && real.face === object.face && real.faceDown === object.faceDown && real.ability?.x === object.ability?.x;
	return walk(table, same ? undefined : object).get(object.id);
}

type Effect = { at: number; change: Modification; source?: Seen; applies: (scope: Scope, object: Seen) => boolean; when?: (scope: Scope) => boolean; ability?: Registration };

const cache = new WeakMap<Table, { clock: number; size: number; work: number; traits: Map<string, Traits> }>();
/** Drop the walk for this revision: `commit` changes the table before the clock moves. */
export const forget = (table: Table) => void cache.delete(table);
/** Every object's characteristics, walked once per table revision and accepted equipment revision. */
export function walk(table: Table, override?: Thing): Map<string, Traits> {
	const cached = cache.get(table);
	if (!override && cached && cached.clock === table.cursor.clock && cached.size === table.things.size && cached.work === table.workLog.length) return cached.traits;
	const field = [...table.things.values()].filter((one) => one.id !== override?.id);
	if (override) field.push(override);
	const now = new Map(field.flatMap((object) => { const traits = base(table, object); return traits ? [[object.id, traits] as const] : []; }));
	const world = tableWorld(table, (object: Seen) => now.get(object.id));
	world.objects = field;
	layers(world, now, field);
	if (!override) cache.set(table, { clock: table.cursor.clock, size: table.things.size, work: table.workLog.length, traits: now });
	return now;
}

/** The same layer walk can read a proposed spell using only the caster's projected facts. */
export function spellCharacteristics(view: SeatView, object: Seen, controller: number, face = 0, x = 0, words: string[] = []): Traits | undefined {
	const printed = view.printed?.[object.card ?? ""], spell = { ...object, controller, zone: "stack" as const, faceDown: false, face: face as 0 | 1 };
	const chosen = currentFacts(printed, spell);
	if (!chosen || !object.card) return undefined;
	const own = (view.work?.packages?.find((one) => one.card === object.card)?.registers ?? []).filter((one) =>
		(one.face === undefined || one.face === face) && one.kind === "continuous" && one.affects.is === "this" && one.affects.zones?.includes("stack"));
	const traits = printedTraits(chosen, object.card, own, x); traits.words = [...words];
	if (printed?.layout === "transform" && face === 1 && !object.copy) traits.manaValue = manaValue({ ...chosen, mana: printed.faces![0]!.mana }, x);
	const world = viewWorld(view), read = world.read, now = new Map([[spell.id, traits]]);
	world.objects = world.objects.map((one) => one.id === spell.id ? spell : one);
	world.read = (one) => now.get(one.id) ?? read(one);
	layers(world, now, [spell], { id: spell.id, x });
	return now.get(spell.id);
}

/** Apply effects to the requested objects. Other sources retain the caller's already-derived reading. */
function layers(world: World, now: Map<string, Traits>, field: Seen[], announced?: { id: string; x: number }) {
	const scope = (source?: Seen): Scope => ({ world, controller: source?.controller ?? 0, ...(source ? { source } : {}), ...(announced && announced.id === source?.id ? { x: announced.x } : {}) });
	const effects: Effect[] = [
		...world.objects.flatMap((source) => (world.read(source)?.registrations ?? []).flatMap((ability): Effect[] => ability.kind === "continuous" &&
			(source.zone === "battlefield" || ability.affects.is === "this" && ability.affects.zones?.includes(source.zone as never)) ? [{
			at: source.transformed ?? source.entered ?? 0, change: ability.change, source, ability,
			applies: (inner, object) => matches(inner, object, ability.affects), ...(ability.if ? { when: (inner: Scope) => holds(inner, ability.if!) } : {}),
		}] : [])),
		...world.notes.flatMap((note: Note): Effect[] => note.kind === "label" && note.change ? [{
			at: note.written, change: note.change, applies: (_inner, object) => object.id === note.on.id && object.incarnation === note.on.incarnation,
		}] : []),
	].sort((a, b) => a.at - b.at);
	// An ability removed earlier in the walk stops making its effect.
	const present = (effect: Effect) => !effect.source || !effect.ability || (world.read(effect.source)?.registrations.includes(effect.ability) ?? false);
	const each = (layer: (change: Modification, traits: Traits, inner: Scope) => void) => {
		for (const effect of effects) {
			if (!present(effect)) continue;
			const inner = scope(effect.source);
			if (effect.when && !effect.when(inner)) continue;
			for (const object of field) {
				const traits = now.get(object.id);
				if (traits && effect.applies(inner, object)) layer(effect.change, traits, inner);
			}
		}
	};

	// Layer 4: types. Setting a land's subtypes removes the abilities its own text gave it (305.7).
	each((change, traits, inner) => {
		const prior = traits.types;
		if (change.types?.set) traits.types = [...new Set([...change.types.set, ...prior.filter(type => type === "instant" || type === "sorcery")])];
		if (change.types?.add) traits.types = [...new Set([...traits.types, ...change.types.add])];
		// 205.1a: losing a card type also loses its correlated subtypes, unless
		// another retained type shares that set (creature/kindred, instant/sorcery).
		for (const lost of prior.filter(type => !traits.types.includes(type))) {
			if (lost === "creature" || lost === "kindred") {
				if (!traits.types.some(type => type === "creature" || type === "kindred")) {
					traits.subtypes = traits.subtypes.filter(type => !creatureType(type)); delete traits.allCreatureTypes;
				}
			} else if (["artifact", "enchantment", "land", "planeswalker", "battle"].includes(lost))
				traits.subtypes = traits.subtypes.filter(type => !subtypesOf(lost as "artifact" | "enchantment" | "land" | "planeswalker" | "battle").has(type.toLowerCase()));
		}
		const subtypes = change.subtypes;
		if (!subtypes) return;
		if (subtypes.set) {
			const chosen = !Array.isArray(subtypes.set) && inner.source?.choices?.[subtypes.set.chosen];
			const set = Array.isArray(subtypes.set) ? subtypes.set : chosen ? [chosen] : undefined;
			if (!set) return;
			const of = subtypes.of;
			const keep = (subtype: string) => of === "creature" ? !creatureType(subtype) : of ? !subtypesOf(of as "artifact" | "enchantment" | "land").has(subtype.toLowerCase()) : false;
			traits.subtypes = [...traits.subtypes.filter(keep), ...set];
			if (of === "land") traits.registrations = [];
			if (of === "creature") delete traits.allCreatureTypes;
		}
		if (subtypes.add) traits.subtypes = [...new Set([...traits.subtypes, ...subtypes.add])];
		if (subtypes.allCreatureTypes) traits.allCreatureTypes = true;
	});
	// Layer 5: setting replaces the color set; adding preserves the colors already applied (613.1e).
	each((change, traits) => {
		if (change.colors?.set) traits.colors = [...change.colors.set] as Color[];
		if (change.colors?.add) traits.colors = [...new Set([...traits.colors, ...change.colors.add])] as Color[];
	});
	// Layer 6: abilities. Keyword counters are keywords too (122.1b).
	each((change, traits) => {
		if (change.loseAbilities) { traits.registrations = []; traits.words = []; traits.lostAbilities = true; }
		if (change.words) traits.words = [...new Set([...traits.words, ...change.words])];
		if (change.registers) traits.registrations = [...traits.registrations, ...change.registers];
	});
	for (const object of field) {
		const traits = now.get(object.id);
		if (!traits) continue;
		for (const [kind, count] of Object.entries(object.counters)) if (count > 0 && !/^[+-]\d+\/[+-]\d+$/.test(kind) && KEYWORD_COUNTERS.has(kind)) traits.words = [...new Set([...traits.words, kind])];
	}
	// Layer 7b sets, then 7c modifies, counters included (613.4c).
	each((change, traits, inner) => {
		if (change.base) { traits.power = amount(inner, change.base.power); traits.toughness = amount(inner, change.base.toughness); }
	});
	each((change, traits, inner) => {
		if (traits.power === undefined) return;
		traits.power += change.power === undefined ? 0 : amount(inner, change.power);
		traits.toughness! += change.toughness === undefined ? 0 : amount(inner, change.toughness);
	});
	for (const object of field) {
		const traits = now.get(object.id);
		// 208.3: printed numbers and counters do not give a noncreature power or toughness.
		if (traits && !traits.types.includes("creature")) { delete traits.power; delete traits.toughness; }
		if (!traits || traits.power === undefined) continue;
		for (const [kind, count] of Object.entries(object.counters)) {
			const counter = kind.match(/^([+-]\d+)\/([+-]\d+)$/);
			if (counter) { traits.power += Number(counter[1]) * count; traits.toughness! += Number(counter[2]) * count; }
		}
	}
}

/** 122.1b. */
const KEYWORD_COUNTERS = new Set(["flying", "first strike", "double strike", "deathtouch", "decayed", "exalted", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "shadow", "trample", "vigilance"]);

/** Has this word now, such as haste or indestructible. */
export const has = (traits: Traits | undefined, word: string) => !!traits?.words.includes(word);
/** A creature that has not been its controller's since their turn began, and has no haste (302.6). */
export const sick = (table: Table, object: Thing, traits = characteristics(table, object)) => {
	return !!traits?.types.includes("creature") && !has(traits, "haste") && (object.entered ?? 0) >= (table.cursor.began[object.controller] ?? 0);
};
