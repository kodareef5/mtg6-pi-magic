/** Reusable card equipment. The source fingerprint and interpreter contract gate reuse;
 * syntax and quotation checks do not certify a model's card interpretation. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, PackageSchema, type Package } from "./language.ts";
import { assessmentProblems } from "./assessment.ts";
import { printedFacts } from "./printed.ts";
import type { Universe } from "./cards.ts";
import type { Table } from "./table.ts";
import { editWork } from "./work-tools.ts";

const STORE = join(import.meta.dirname, "..", "..", "prepared", "packages");
const CONTRACT = 1;
const slug = (card: string) => card.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Stored = { card: string; generated: string; source: string; contract: number; model?: string; package: Package };
const fingerprint = (universe: Universe, card: string) => createHash("sha256").update(JSON.stringify(printedFacts(universe, [card])[card])).digest("hex");
const bound = (value: unknown): boolean => !!value && typeof value === "object" && Object.entries(value).some(([key, child]) =>
	["refs", "ids"].includes(key) || bound(child));

/** Write one complete record, so concurrent readers never see a partial JSON file. */
export function writeRecord(path: string, value: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	const temporary = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temporary, JSON.stringify(value, null, "\t") + "\n");
	renameSync(temporary, path);
}

/** Compatible, source-checked packages only. A stale source or contract needs fresh assessment. */
export function storedPackages(universe: Universe, store = STORE): Map<string, Stored> {
	const dir = join(store, universe.generated), kept = new Map<string, Stored>();
	if (!existsSync(dir)) return kept;
	for (const file of readdirSync(dir).filter((file) => file.endsWith(".json") && file !== "ledger.json").sort()) {
		const one = JSON.parse(readFileSync(join(dir, file), "utf8")) as Stored;
		if (typeof one.card !== "string" || one.package?.card !== one.card) throw new Error(`Invalid stored package: ${file}`);
		if (!universe.cards.has(one.card) || one.generated !== universe.generated || one.contract !== CONTRACT || one.source !== fingerprint(universe, one.card)) continue;
		check(PackageSchema, one.package, file);
		const problems = assessmentProblems(printedFacts(universe, [one.card])[one.card]!, one.package);
		if (!one.package.assessed || bound(one.package) || problems.length) throw new Error(`Invalid stored assessment ${file}: ${problems.join("; ") || "not assessed or bound to game objects"}`);
		if (kept.has(one.card)) throw new Error(`Duplicate stored assessment for ${one.card}`);
		kept.set(one.card, one);
	}
	return kept;
}

/** Every seat needs the registered universe, including cards it may gain control of. */
export function loadStored(table: Table, universe: Universe, complete: (seat: number) => boolean = () => false, store = STORE): number {
	const kept = storedPackages(universe, store);
	let loaded = 0;
	for (const seat of table.seats) {
		const have = new Set(table.work[seat.id]?.packages?.filter((pack) => pack.assessed).map((pack) => pack.card));
		const puts = Object.entries(table.printed).flatMap(([card, printed]) => {
			const pack = kept.get(card)?.package;
			return printed.text && !have.has(card) && pack && !(complete(seat.id) && pack.deferred?.length)
				? [{ do: "package.put" as const, package: structuredClone(pack) }] : [];
		});
		if (puts.length) { editWork(table, seat.id, puts, `stored-assessment-${seat.id}`); loaded += puts.length; }
	}
	return loaded;
}

/** Store an accepted assessment that has no game object bindings. */
export function storePackage(universe: Universe, pack: Package, model?: string, store = STORE): void {
	check(PackageSchema, pack, pack.card);
	const printed = printedFacts(universe, [pack.card])[pack.card];
	const problems = printed ? assessmentProblems(printed, pack) : ["card is absent from the universe"];
	if (!pack.assessed || bound(pack) || problems.length) throw new Error(`Cannot store ${pack.card}: ${problems.join("; ") || "not assessed or bound to game objects"}`);
	writeRecord(join(store, universe.generated, `${slug(pack.card)}.json`), {
		card: pack.card, generated: universe.generated, source: fingerprint(universe, pack.card), contract: CONTRACT,
		...(model ? { model } : {}), package: pack,
	} satisfies Stored);
}

/** Assessment refusals are separate from reusable equipment. */
export const ledgerPath = (generated: string) => join(STORE, generated, "ledger.json");

/** Keep successes even when another card stops setup. Never replace carried game equipment. */
export function saveAssessed(table: Table, universe: Universe, model?: (seat: number) => string | undefined, store = STORE): number {
	const kept = new Set(storedPackages(universe, store).keys());
	let saved = 0;
	for (const seat of table.seats) for (const pack of table.work[seat.id]?.packages ?? []) {
		if (!pack.assessed || kept.has(pack.card) || bound(pack)) continue;
		storePackage(universe, pack, model?.(seat.id), store);
		kept.add(pack.card); saved++;
	}
	return saved;
}
