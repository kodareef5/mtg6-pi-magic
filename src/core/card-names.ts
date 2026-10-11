/** The pinned Oracle name catalog, independent of deck legality and hidden objects (201.4). */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export type NameSource = { path: string; sha256: string };
const catalogs = new Map<string, { name: string; types: string[] }[]>();
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");

/** A companion belongs to the exact card file, not merely its date. */
export function nameSource(cards: string): NameSource | undefined {
	const path = cards.replace(/\.tsv$/, "") + ".names.tsv";
	if (!existsSync(path)) return undefined;
	const text = readFileSync(path, "utf8");
	if (!text.includes(`# Cards source: ${fingerprint(readFileSync(cards, "utf8"))}\n`)) throw new Error(`Card name data does not match ${cards}`);
	return { path, sha256: fingerprint(text) };
}

/** Match only printed card types. Other name qualifications require more source fields. */
export function cardNameChoices(source: NameSource | undefined, types: readonly string[] = []): string[] {
	if (!source) throw new Error("Choosing an Oracle card name requires a pinned name catalog.");
	const key = `${source.path}\0${source.sha256}`;
	if (!catalogs.has(key)) {
		const text = readFileSync(source.path, "utf8");
		if (fingerprint(text) !== source.sha256) throw new Error(`Card name data differs from the game's pinned source: ${source.path}`);
		const lines = text.split("\n").filter((line) => line && !line.startsWith("#"));
		if (lines.shift() !== "name\ttypes") throw new Error(`Invalid card name catalog: ${source.path}`);
		catalogs.set(key, lines.map((line) => { const [name, types = ""] = line.split("\t"); return { name: name!, types: types.split(",") }; }));
	}
	return catalogs.get(key)!.filter((one) => !types.length || types.some((type) => one.types.includes(type))).map((one) => one.name);
}
