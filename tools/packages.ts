/**
 * Card interpretations kept once per card. A package names a card's standing abilities and uses from its
 * printed text alone, so it belongs to no deck, opponent or game. The store is keyed by the card file's
 * generated date, because a card whose text changed is a different card. A fresh pairing loads what the
 * store has before seating and saves what seating assessed, so setup pays for new cards only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Package } from "../src/core/language.ts";
import type { Table } from "../src/core/table.ts";
import { editWork } from "../src/core/work-tools.ts";

const STORE = join(import.meta.dirname, "..", "prepared", "packages");
const slug = (card: string) => card.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Stored = { card: string; generated: string; model?: string; package: Package };

/** Every stored package for this card file date, by card name. */
export function storedPackages(generated: string): Map<string, Stored> {
	const dir = join(STORE, generated);
	if (!existsSync(dir)) return new Map();
	return new Map(readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => {
		const one = JSON.parse(readFileSync(join(dir, file), "utf8")) as Stored; return [one.card, one];
	}));
}

/** Put every stored package a seat's registered cards have into its work, before any assessment runs. */
export function loadStored(table: Table, generated: string): number {
	const kept = storedPackages(generated);
	let loaded = 0;
	for (const seat of table.seats) {
		const have = new Set(table.work[seat.id]?.packages?.filter((pack) => pack.assessed).map((pack) => pack.card));
		const puts = Object.entries(table.printed).filter(([card, printed]) => printed.text && !have.has(card) && kept.has(card))
			.map(([card]) => ({ do: "package.put" as const, package: structuredClone(kept.get(card)!.package) }));
		if (puts.length) { editWork(table, seat.id, puts, `stored-assessment-${seat.id}`); loaded += puts.length; }
	}
	return loaded;
}

/** Save every assessed package the table holds that the store lacks. A package bound to a game object never crosses games. */
export function saveAssessed(table: Table, generated: string, model?: string): number {
	const kept = storedPackages(generated), dir = join(STORE, generated);
	let saved = 0;
	for (const seat of table.seats) for (const pack of table.work[seat.id]?.packages ?? []) {
		if (!pack.assessed || kept.has(pack.card) || /"(?:refs|ids)":/.test(JSON.stringify(pack))) continue;
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${slug(pack.card)}.json`), JSON.stringify({ card: pack.card, generated, ...(model ? { model } : {}), package: pack } satisfies Stored, null, "\t") + "\n");
		kept.set(pack.card, { card: pack.card, generated, package: pack }); saved++;
	}
	return saved;
}
