/** Reusable card equipment. The source fingerprint and interpreter contract gate reuse;
 * syntax and quotation checks do not certify a model's card interpretation. */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { check, PackageSchema, type Package } from "./language.ts";
import { assessmentProblems } from "./assessment.ts";
import { printedFacts } from "./printed.ts";
import type { Universe } from "./cards.ts";
import type { Table } from "./table.ts";
import { editWork } from "./work-tools.ts";
import { alpha, collection, problems as deckProblems, type Deck } from "./decks.ts";
import { standard } from "./format.ts";

export const PACKAGE_SEED = join(import.meta.dirname, "..", "..", "prepared", "packages");
export type PackageStore = { seed: string; cache: string; notice: (message: string) => void };
const location = (options: Partial<PackageStore>): PackageStore => ({ seed: PACKAGE_SEED,
	cache: join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "magic", "packages"),
	notice: console.warn, ...options });
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
	try {
		writeFileSync(temporary, JSON.stringify(value, null, "\t") + "\n");
		renameSync(temporary, path);
	} finally { rmSync(temporary, { force: true }); }
}

/** Compatible, source-checked packages only. A stale source or contract needs fresh assessment. */
export function storedPackages(universe: Universe, options: Partial<PackageStore> = {}): Map<string, Stored> {
	const { seed, cache, notice } = location(options), kept = new Map<string, Stored>();
	for (const store of new Set([seed, cache])) {
		const dir = join(store, universe.generated), seen = new Set<string>();
		let files: string[];
		try { files = readdirSync(dir); } catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") notice(`Cannot read preparation store ${dir}: ${String(error)}`);
			continue;
		}
		for (const file of files.filter((file) => file.endsWith(".json") && file !== "ledger.json").sort()) try {
			const one = JSON.parse(readFileSync(join(dir, file), "utf8")) as Stored;
			if (!one || typeof one.card !== "string" || one.package?.card !== one.card) throw new Error("Invalid package record");
			if (!universe.cards.has(one.card) || one.generated !== universe.generated || one.contract !== CONTRACT || one.source !== fingerprint(universe, one.card))
				throw new Error("Source or interpreter contract changed; fresh assessment is required");
			check(PackageSchema, one.package, file);
			const problems = assessmentProblems(printedFacts(universe, [one.card])[one.card]!, one.package);
			if (!one.package.assessed || bound(one.package) || problems.length) throw new Error(problems.join("; ") || "Not assessed or bound to game objects");
			if (seen.has(one.card)) throw new Error(`Duplicate assessment for ${one.card}`);
			seen.add(one.card); kept.set(one.card, one);
		} catch (error) { notice(`Skipped preparation ${join(dir, file)}: ${String(error)}`); }
	}
	return kept;
}

/** Random alpha games draw only legal imported main decks with complete standing coverage.
 * Deferred uses still require interpretation in the game; admission does not certify play. */
export function admittedAlpha(universe: Universe, options: Partial<PackageStore> = {}): Deck[] {
	const kept = storedPackages(universe, options);
	return [...collection().values()].filter((one) => /^https?:/.test(one.source)).map(alpha).filter((one) =>
		!deckProblems(universe, one, standard).length && Object.entries(printedFacts(universe, Object.keys(one.main)))
			.every(([card, printed]) => !printed.text || kept.has(card)));
}

/** Every seat needs the registered universe, including cards it may gain control of. */
export function loadStored(table: Table, universe: Universe, complete: (seat: number) => boolean = () => false, options: Partial<PackageStore> = {}): number {
	const kept = storedPackages(universe, options);
	let loaded = 0;
	for (const seat of table.seats) {
		const have = new Set(table.work[seat.id]?.packages?.filter((pack) => pack.assessed).map((pack) => pack.card));
		const puts = Object.entries(table.printed).flatMap(([card, printed]) => {
			const pack = kept.get(card)?.package;
			return printed.text && !have.has(card) && pack && !(complete(seat.id) && pack.deferred?.length)
				? [{ do: "package.put" as const, package: structuredClone(pack) }] : [];
		});
		for (const put of puts) try {
			editWork(table, seat.id, [put], `stored-assessment-${seat.id}-${put.package.card}`); loaded++;
		} catch (error) { location(options).notice(`Skipped preparation for ${put.package.card}: ${String(error)}`); }
	}
	return loaded;
}

/** Store an accepted assessment that has no game object bindings. */
export function storePackage(universe: Universe, pack: Package, model?: string, options: Partial<PackageStore> = {}): boolean {
	const { cache, notice } = location(options);
	try {
		check(PackageSchema, pack, pack.card);
		const printed = printedFacts(universe, [pack.card])[pack.card];
		const problems = printed ? assessmentProblems(printed, pack) : ["card is absent from the universe"];
		if (!pack.assessed || bound(pack) || problems.length) throw new Error(`Cannot store ${pack.card}: ${problems.join("; ") || "not assessed or bound to game objects"}`);
		writeRecord(join(cache, universe.generated, `${slug(pack.card)}.json`), {
			card: pack.card, generated: universe.generated, source: fingerprint(universe, pack.card), contract: CONTRACT,
			...(model ? { model } : {}), package: pack,
		} satisfies Stored);
		return true;
	} catch (error) { notice(`Could not cache preparation for ${pack.card}: ${String(error)}`); return false; }
}

/** Assessment refusals are separate from reusable equipment. */
export const ledgerPath = (generated: string) => join(PACKAGE_SEED, generated, "ledger.json");

/** Keep successes even when another card stops setup. Never replace carried game equipment. */
export function saveAssessed(table: Table, universe: Universe, model?: (seat: number) => string | undefined, options: Partial<PackageStore> = {}): number {
	const kept = new Set(storedPackages(universe, options).keys());
	let saved = 0;
	for (const seat of table.seats) for (const pack of table.work[seat.id]?.packages ?? []) {
		if (!pack.assessed || kept.has(pack.card) || bound(pack)) continue;
		if (storePackage(universe, pack, model?.(seat.id), options)) { kept.add(pack.card); saved++; }
	}
	return saved;
}
