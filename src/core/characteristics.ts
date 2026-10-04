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
import { join } from "node:path";
import { load as loadRules, rule, type Rules } from "./rules.ts";
import { cardsIn, type Note, type Table, type Thing } from "./table.ts";
import type { Mana } from "./table.ts";
import type { Modification, Registration } from "./language.ts";
import { amount, holds, matches, tableWorld, type Scope, type Seen } from "./selectors.ts";

type Color = Mana["color"];
export type Traits = {
	name: string;
	supertypes: string[];
	types: string[];
	subtypes: string[];
	/** Every creature type at once (Soulstone Sanctuary). */
	allCreatureTypes?: true;
	colors: Color[];
	power?: number;
	toughness?: number;
	/** Keywords and restriction words. */
	words: string[];
	/** The abilities it has now: its own unless removed, and granted ones. */
	registrations: Registration[];
};

const SUPERTYPES = new Set(["basic", "legendary", "ongoing", "snow", "world"]);
let shippedRules: Rules | undefined;
let categories: Record<string, Set<string>> | undefined;
/** Subtypes by the card type they belong to, read from 205.3g-k in the pinned rules. */
export function subtypesOf(kind: "artifact" | "enchantment" | "land" | "planeswalker" | "spell"): Set<string> {
	if (!categories) {
		shippedRules ??= loadRules(join(import.meta.dirname, "..", "..", "rules", "cr.tsv"));
		const rules = shippedRules;
		const listed = (ref: string) => new Set((rule(rules, ref).text.match(/types are (.*?)\.(?: Of that list|$)/)?.[1] ?? "")
			.replace(/\s*\(see rules? [^)]*\)/g, "").replace(/,? and /, ", ").split(/,\s*/).map((one) => one.trim().toLowerCase()).filter(Boolean));
		categories = { artifact: listed("205.3g"), enchantment: listed("205.3h"), land: listed("205.3i"), planeswalker: listed("205.3j"), spell: listed("205.3k") };
	}
	return categories[kind]!;
}
/** A subtype belongs to the creature types when it is no other card type's subtype. */
export const creatureType = (subtype: string) => !(["artifact", "enchantment", "land", "planeswalker", "spell"] as const).some((kind) => subtypesOf(kind).has(subtype.toLowerCase()));

const BASIC: Record<string, Color> = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G" };
/** 305.6: a land with a basic land type taps for that type's color. */
export const intrinsic = (traits?: Traits): Color[] => traits?.types.includes("land")
	? traits.subtypes.flatMap((subtype) => BASIC[subtype.toLowerCase()] ? [BASIC[subtype.toLowerCase()]!] : []) : [];

/** The printed card or the token spec, before any effect. */
export function base(table: Table, object: Thing): Traits | undefined {
	const own = [...(object.registrations ?? []), ...registered(table, object)];
	if (object.token) {
		const spec = object.token;
		return { name: spec.name, supertypes: [...(spec.supertypes ?? [])], types: [...spec.types], subtypes: [...(spec.subtypes ?? [])],
			colors: [...spec.colors] as Color[], ...(spec.power !== undefined ? { power: spec.power, toughness: spec.toughness ?? 0 } : {}),
			words: [...(spec.words ?? [])], registrations: [...(spec.registers ?? []), ...own] };
	}
	const printed = object.card && !object.faceDown ? table.printed[object.card] : undefined;
	if (!printed) return undefined;
	const [left, right = ""] = printed.type.split("—").map((part) => part.trim());
	const words = left!.split(/\s+/).map((word) => word.toLowerCase());
	const stats = printed.stats.match(/^(-?\d+)\/(-?\d+)$/);
	return {
		name: object.card!, supertypes: words.filter((word) => SUPERTYPES.has(word)), types: words.filter((word) => !SUPERTYPES.has(word)),
		subtypes: right ? right.split(/\s+/) : [],
		colors: [...new Set(printed.mana.match(/\{([WUBRG])\}/g)?.map((symbol) => symbol[1] as Color) ?? [])],
		...(stats ? { power: Number(stats[1]), toughness: Number(stats[2]) } : {}), words: [], registrations: own,
	};
}
const registered = (table: Table, object: Thing) => table.notes.flatMap((note) =>
	note.kind === "register" && note.on.id === object.id && note.on.incarnation === object.incarnation ? [note.registration] : []);

/** One object's characteristics now. Battlefield objects go through the layers. */
export function characteristics(table: Table, object: Thing): Traits | undefined {
	return object.zone === "battlefield" ? walk(table).get(object.id) : base(table, object);
}

type Effect = { at: number; change: Modification; source?: Thing; applies: (scope: Scope, object: Seen) => boolean; when?: (scope: Scope) => boolean; ability?: Registration };

const cache = new WeakMap<Table, { clock: number; size: number; traits: Map<string, Traits> }>();
/** Every battlefield object's characteristics, walked once per table revision. */
export function walk(table: Table): Map<string, Traits> {
	const cached = cache.get(table);
	if (cached && cached.clock === table.cursor.clock && cached.size === table.things.size) return cached.traits;
	const field = cardsIn(table, "battlefield");
	const now = new Map(field.flatMap((object) => { const traits = base(table, object); return traits ? [[object.id, traits] as const] : []; }));
	const world = tableWorld(table, (object: Seen) => object.zone === "battlefield" ? now.get(object.id) : base(table, object as Thing));
	const scope = (source?: Thing): Scope => ({ world, controller: source?.controller ?? 0, ...(source ? { source } : {}) });

	const effects: Effect[] = [
		...field.flatMap((source) => (now.get(source.id)?.registrations ?? []).flatMap((ability): Effect[] => ability.kind === "continuous" ? [{
			at: source.entered ?? 0, change: ability.change, source, ability,
			applies: (inner, object) => matches(inner, object, ability.affects), ...(ability.if ? { when: (inner: Scope) => holds(inner, ability.if!) } : {}),
		}] : [])),
		...table.notes.flatMap((note: Note): Effect[] => note.kind === "label" && note.change ? [{
			at: note.written, change: note.change, applies: (_inner, object) => object.id === note.on.id && object.incarnation === note.on.incarnation,
		}] : []),
	].sort((a, b) => a.at - b.at);
	// An ability removed earlier in the walk stops making its effect.
	const present = (effect: Effect) => !effect.source || !effect.ability || (now.get(effect.source.id)?.registrations.includes(effect.ability) ?? false);
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
	each((change, traits) => {
		if (change.types?.set) traits.types = [...change.types.set];
		if (change.types?.add) traits.types = [...new Set([...traits.types, ...change.types.add])];
		const subtypes = change.subtypes;
		if (!subtypes) return;
		if (subtypes.set) {
			const of = subtypes.of;
			const keep = (subtype: string) => of === "creature" ? !creatureType(subtype) : of ? !subtypesOf(of as "artifact" | "enchantment" | "land").has(subtype.toLowerCase()) : false;
			traits.subtypes = [...traits.subtypes.filter(keep), ...subtypes.set];
			if (of === "land") traits.registrations = [];
			if (of === "creature") delete traits.allCreatureTypes;
		}
		if (subtypes.add) traits.subtypes = [...new Set([...traits.subtypes, ...subtypes.add])];
		if (subtypes.allCreatureTypes) traits.allCreatureTypes = true;
	});
	// Layer 6: abilities. Keyword counters are keywords too (122.1b).
	each((change, traits) => {
		if (change.loseAbilities) { traits.registrations = []; traits.words = []; }
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
		if (!traits || traits.power === undefined) continue;
		for (const [kind, count] of Object.entries(object.counters)) {
			const counter = kind.match(/^([+-]\d+)\/([+-]\d+)$/);
			if (counter) { traits.power += Number(counter[1]) * count; traits.toughness! += Number(counter[2]) * count; }
		}
	}
	cache.set(table, { clock: table.cursor.clock, size: table.things.size, traits: now });
	return now;
}

/** 122.1b. */
const KEYWORD_COUNTERS = new Set(["flying", "first strike", "double strike", "deathtouch", "decayed", "exalted", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "shadow", "trample", "vigilance"]);

/** Has this word now, such as haste or indestructible. */
export const has = (traits: Traits | undefined, word: string) => !!traits?.words.includes(word);
/** A creature that has not been its controller's since their turn began, and has no haste (302.6). */
export const sick = (table: Table, object: Thing) => {
	const traits = characteristics(table, object);
	return !!traits?.types.includes("creature") && !has(traits, "haste") && (object.entered ?? 0) >= (table.cursor.began[object.controller] ?? 0);
};
