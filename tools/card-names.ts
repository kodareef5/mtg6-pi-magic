#!/usr/bin/env node
/** Pin Oracle card names and printed types from an existing bulk snapshot, including names outside the game format. */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { parseArgs } from "node:util";
import { load } from "../src/core/cards.ts";
import { CARD_TYPES } from "../src/core/language.ts";

const { values } = parseArgs({ options: { bulk: { type: "string", default: ".cache/default-cards.jsonl.gz" },
	cards: { type: "string", default: "cards/standard.tsv" }, out: { type: "string", default: "cards/standard.names.tsv" } } });
const universe = load(values.cards!), names = new Map<string, Set<string>>(), verified = new Set<string>();
type Face = { name: string; type_line?: string; mana_cost?: string; oracle_text?: string };
type Card = Face & { oracle_id?: string; layout: string; card_faces?: Face[] };
const noncards = new Set(["token", "double_faced_token", "emblem", "art_series"]);
const source = createInterface({ input: createReadStream(values.bulk!).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of source) {
	const card = JSON.parse(line) as Card;
	if (!card.oracle_id || noncards.has(card.layout)) continue;
	const faces = card.card_faces?.length ? card.card_faces : [card];
	for (const face of faces) {
		const types = (face.type_line ?? card.type_line ?? "").split("—")[0]!.toLowerCase().split(/\s+/);
		const known = names.get(face.name) ?? new Set<string>();
		for (const type of CARD_TYPES) if (types.includes(type)) known.add(type);
		names.set(face.name, known);
	}
	const pinned = universe.cards.get(card.name);
	if (!pinned || verified.has(card.name)) continue;
	const expected = pinned.faces ?? [{ name: pinned.name, type: pinned.type, mana: pinned.mana, oracle: pinned.oracle }];
	if (expected.length === faces.length && expected.every((one, at) => {
		const face = faces[at]!;
		return one.name === face.name && one.type === (face.type_line ?? card.type_line ?? "") &&
			one.mana === (face.mana_cost ?? "") && one.oracle === (face.oracle_text ?? "");
	})) verified.add(card.name);
}
const missing = [...universe.cards.keys()].filter((name) => !verified.has(name));
if (missing.length) throw new Error(`The bulk snapshot differs from the pinned card data: ${missing.join(", ")}. No catalog was written.`);
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const rows = [...names].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, types]) => `${name}\t${[...types].sort().join(",")}`);
writeFileSync(values.out!, [
	"# Oracle card names and printed card types, including individual faces and cards outside the current format.",
	`# Generated: ${universe.generated}`, `# Cards source: ${sha(values.cards!)}`, `# Bulk source: ${sha(values.bulk!)}`,
	"# Source: Scryfall Default Cards bulk snapshot. No network call or card-universe refresh.",
	"# Rebuild: node tools/card-names.ts --bulk SNAPSHOT --cards PINNED.tsv --out PINNED.names.tsv",
	"name\ttypes", ...rows, "",
].join("\n"));
console.log(`${names.size} names written to ${values.out}; all ${verified.size} pinned cards match the source snapshot.`);
