/** Declared card support: the accepted meaning of each card, as checked structured terms.
 * `cards/support.jsonl` holds one line per card name. A supported line carries
 * interpretations in the procedure vocabulary; a todo line names what the card
 * needs. A card with no rules text needs no line, because its printed facts are
 * complete. A game refuses any registered card that has rules text and no
 * supported line, so no card is passed over or played as a simpler effect.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Check, Errors } from "typebox/value";
import { checkProcedure } from "./procedures.ts";
import { SupportSchema, type Support } from "./work-language.ts";
import type { Table } from "./table.ts";

export type Registry = { path: string; sha256: string; cards: Map<string, Support> };

const SHIPPED = join(import.meta.dirname, "..", "..", "cards", "support.jsonl");
let shippedRegistry: Registry | undefined;
export const shippedSupport = (): Registry => (shippedRegistry ??= loadSupport(SHIPPED));

/** Every line is checked against the vocabulary when read; a bad line refuses the file. */
export function loadSupport(path: string): Registry {
	const text = readFileSync(path, "utf8");
	const cards = new Map<string, Support>(), ids = new Set<string>();
	text.split("\n").forEach((line, at) => {
		if (!line.trim()) return;
		const entry: unknown = JSON.parse(line);
		if (!Check(SupportSchema, entry)) throw new Error(`${path}:${at + 1}: ${JSON.stringify(Errors(SupportSchema, entry).slice(0, 2))}`);
		if (cards.has(entry.card)) throw new Error(`${path}:${at + 1}: ${entry.card} has two lines.`);
		if (entry.status === "supported") {
			for (const { id, procedure } of entry.interpretations) {
				if (ids.has(id)) throw new Error(`${path}:${at + 1}: interpretation id ${id} is already used.`);
				ids.add(id);
				if (procedure.source.card !== entry.card || procedure.source.refs) throw new Error(`${path}:${at + 1}: an interpretation of ${entry.card} must select that card by name.`);
				checkProcedure(procedure);
			}
		}
		cards.set(entry.card, entry);
	});
	return { path, sha256: createHash("sha256").update(text).digest("hex"), cards };
}

/** Lines for the registered names, carried on the table like printed facts. */
export const supportFor = (registry: Registry, names: string[]): Record<string, Support> =>
	Object.fromEntries([...new Set(names)].sort().flatMap((name) => registry.cards.has(name) ? [[name, structuredClone(registry.cards.get(name)!)]] : []));

/** Registered cards with rules text and no supported line, with what each needs. */
export function unsupported(table: Pick<Table, "seats" | "printed" | "support">): { card: string; needs: string[] }[] {
	const names = [...new Set(table.seats.flatMap((seat) => seat.deck))].sort();
	return names.flatMap((card) => {
		const printed = table.printed[card], line = table.support[card];
		if (!printed) return [{ card, needs: ["a card in the pinned card file"] }];
		if (!printed.text || line?.status === "supported") return [];
		return [{ card, needs: line?.status === "todo" ? line.needs : ["a support line"] }];
	});
}

/** Refuse to begin a game the table cannot play as written. */
export function refuseUnsupported(table: Pick<Table, "seats" | "printed" | "support">): void {
	const missing = unsupported(table);
	if (missing.length) throw new Error(`This game cannot begin: ${missing.length} registered card${missing.length === 1 ? " is" : "s are"} unsupported. ` +
		missing.map(({ card, needs }) => `${card} (needs ${needs.join("; ")})`).join(", ") + ". Run npm run support to see coverage.");
}
