/** Type line, mana cost and power/toughness from the pinned card file.
 * Core keeps a card's rules text but never interprets it: it only checks that
 * a registration quotes it word for word. Tokens, face-down objects and effects
 * that change characteristics are not handled here.
 */
import { join } from "node:path";
import { load, type Universe } from "./cards.ts";
import type { Mana, Table, Thing } from "./table.ts";

export type Printed = { type: string; mana: string; stats: string; text: boolean; oracle: string };

const SHIPPED = join(import.meta.dirname, "..", "..", "cards", "standard.tsv");
let shippedUniverse: Universe | undefined;
/** The committed Standard file, read once. */
export const shipped = (): Universe => (shippedUniverse ??= load(SHIPPED));

/** `text` is false when a card's only text is reminder text, as on a basic land. */
export function printedFacts(universe: Universe, names: string[]): Record<string, Printed> {
	return Object.fromEntries([...new Set(names)].sort().flatMap((name) => {
		const card = universe.cards.get(name);
		return card ? [[name, { type: front(card.type), mana: front(card.mana), stats: front(card.stats),
			text: card.oracle.split(" // ")[0]!.replace(/\([^)]*\)/g, "").trim().length > 0, oracle: card.oracle }]] : [];
	}));
}
const front = (field: string) => field.split(" // ")[0]!.trim();

export const facts = (table: Table, object: Pick<Thing, "card" | "faceDown">): Printed | undefined =>
	object.card && !object.faceDown ? table.printed[object.card] : undefined;
export const isLand = (printed?: Printed) => !!printed && /\bLand\b/.test(printed.type.split("—")[0]!);
export const isCreature = (printed?: Printed) => !!printed && /\bCreature\b/.test(printed.type.split("—")[0]!);

/** Numeric printed power and toughness. A `*` value is undefined here. */
export function basePT(printed?: Printed): { power: number; toughness: number } | undefined {
	const match = isCreature(printed) ? printed!.stats.match(/^(-?\d+)\/(-?\d+)$/) : null;
	return match ? { power: Number(match[1]), toughness: Number(match[2]) } : undefined;
}

/** Generic and colored symbols only. X, hybrid and Phyrexian costs need choices. */
export function manaCost(printed?: Printed): { tap: false; generic: number; colors: Mana["color"][] } | undefined {
	if (!printed) return undefined;
	const symbols = printed.mana.match(/\{[^}]+\}/g) ?? [];
	if (symbols.join("") !== printed.mana) return undefined;
	let generic = 0;
	const colors: Mana["color"][] = [];
	for (const symbol of symbols.map((s) => s.slice(1, -1))) {
		if (/^\d+$/.test(symbol)) generic += Number(symbol);
		else if (/^[WUBRGC]$/.test(symbol)) colors.push(symbol as Mana["color"]);
		else return undefined;
	}
	return { tap: false, generic, colors };
}

const BASIC: Record<string, Mana["color"]> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
/** 305.6: a land with a basic land type taps for that type's color. */
export function intrinsicMana(printed?: Printed): Mana["color"][] {
	if (!isLand(printed)) return [];
	const subtypes = printed!.type.split("—")[1]?.trim().split(/\s+/) ?? [];
	return subtypes.flatMap((subtype) => BASIC[subtype] ? [BASIC[subtype]] : []);
}

/** A permanent spell other than an Aura, with a cost of generic and colored symbols only. */
export const permanentSpell = (printed?: Printed) => !!printed && !isLand(printed) && !!manaCost(printed) &&
	/\b(Artifact|Battle|Creature|Enchantment|Planeswalker)\b/.test(printed.type.split("—")[0]!) && !/\bAura\b/.test(printed.type.split("—")[1] ?? "");

/**
 * Ordinary permanent casting has no targets: of the permanent spells these
 * lists hold, only an Aura targets what it will enchant (115.1b, 303.4a,
 * 601.2c). Mutate is the exception the rules have and these lists do not
 * (702.140a); a card with it needs this to make room for it.
 */
export const targetless = (types: readonly string[], subtypes: readonly string[]) =>
	types.some((type) => ["artifact", "battle", "creature", "enchantment", "planeswalker"].includes(type.toLowerCase())) && !subtypes.some((one) => one.toLowerCase() === "aura");
/** The same, read from a printed type line. */
export const printedTargetless = (printed?: Printed) => !!printed &&
	targetless(printed.type.split("—")[0]!.trim().split(/\s+/), (printed.type.split("—")[1] ?? "").trim().split(/\s+/).filter(Boolean));

/**
 * Whether a registration's basis is the card's own text, word for word: line
 * breaks, reminder text, dashes, apostrophes and case aside. Separate quotations
 * may be joined with literal " ... ". Each part consists of complete printed
 * sentences or lines, in source order. This checks provenance, not meaning.
 */
export function quotes(printed: Pick<Printed, "oracle"> | undefined, basis: string): boolean {
	const plain = (text: string) => text.replace(/\\n|\n/g, " ").replace(/\([^)]*\)/g, " ").replace(/^\s*•\s*/, "").replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-")
		.replace(/\s+/g, " ").trim().toLowerCase();
	const quoted = basis.split(" ... ").map((part) => {
		const text = plain(part);
		return (text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text).replace(/\.$/, "");
	});
	const sentences = (printed?.oracle ?? "").replace(/\\n/g, "\n").replace(/\([^)]*\)/g, " ")
		.split(/\n|(?<=[.!?])\s+/).map(plain).filter(Boolean);
	let next = 0;
	return !!printed && quoted.every((part) => {
		if (!part) return false;
		for (let start = next; start < sentences.length; start++) {
			for (let end = start; end < sentences.length; end++) {
				if (sentences.slice(start, end + 1).join(" ").replace(/\.$/, "") !== part) continue;
				next = end + 1;
				return true;
			}
		}
		return false;
	});
}
