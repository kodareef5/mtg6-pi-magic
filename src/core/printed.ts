/** Printed characteristics from the pinned card file. Facts, not meaning.
 * Type line, mana cost and power/toughness are structured fields. Core records
 * only whether rules text exists; it never reads that text. Effects that change
 * characteristics, tokens and face-down objects need a characteristics reader.
 */
import { join } from "node:path";
import { load, type Universe } from "./cards.ts";
import type { Mana, Table, Thing } from "./table.ts";

export type Printed = { type: string; mana: string; stats: string; text: boolean };

const SHIPPED = join(import.meta.dirname, "..", "..", "cards", "standard.tsv");
let shippedUniverse: Universe | undefined;
/** The committed Standard file, read once. A journal pins its hash. */
export const shipped = (): Universe => (shippedUniverse ??= load(SHIPPED));

/** Reminder text in parentheses explains an ability the type line already grants. */
export function printedFacts(universe: Universe, names: string[]): Record<string, Printed> {
	return Object.fromEntries([...new Set(names)].sort().flatMap((name) => {
		const card = universe.cards.get(name);
		return card ? [[name, { type: front(card.type), mana: front(card.mana), stats: front(card.stats),
			text: card.oracle.split(" // ")[0]!.replace(/\([^)]*\)/g, "").trim().length > 0 }]] : [];
	}));
}
const front = (field: string) => field.split(" // ")[0]!.trim();

export const facts = (table: Table, object: Pick<Thing, "card" | "faceDown">): Printed | undefined =>
	object.card && !object.faceDown ? table.printed[object.card] : undefined;
export const isLand = (printed?: Printed) => !!printed && /\bLand\b/.test(printed.type.split("—")[0]!);
export const isCreature = (printed?: Printed) => !!printed && /\bCreature\b/.test(printed.type.split("—")[0]!);
export const permanent = (printed?: Printed) => !!printed && /\b(Artifact|Battle|Creature|Enchantment|Land|Planeswalker)\b/.test(printed.type.split("—")[0]!);
export const instant = (printed?: Printed) => !!printed && /\bInstant\b/.test(printed.type.split("—")[0]!);

/** Numeric base power and toughness. A star is defined by text, so it has none here. */
export function basePT(printed?: Printed): { power: number; toughness: number } | undefined {
	const match = isCreature(printed) ? printed!.stats.match(/^(-?\d+)\/(-?\d+)$/) : null;
	return match ? { power: Number(match[1]), toughness: Number(match[2]) } : undefined;
}

/** Generic and colored symbols only. X, hybrid and Phyrexian costs need choices. */
export function manaCost(printed?: Printed): { generic: number; colors: Mana["color"][] } | undefined {
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
	return { generic, colors };
}

const BASIC: Record<string, Mana["color"]> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
/** 305.6: a land with a basic land type taps for that color. Read from the subtype list. */
export function intrinsicMana(printed?: Printed): Mana["color"][] {
	if (!isLand(printed)) return [];
	const subtypes = printed!.type.split("—")[1]?.trim().split(/\s+/) ?? [];
	return subtypes.flatMap((subtype) => BASIC[subtype] ? [BASIC[subtype]] : []);
}

/** Playable without an accepted interpretation: a land whose printed facts are complete. */
export const plainLand = (printed?: Printed) => isLand(printed) && !printed!.text;
