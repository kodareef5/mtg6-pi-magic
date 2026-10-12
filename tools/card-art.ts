#!/usr/bin/env node
/** Pin one Scryfall printing per card for board images: art only, never rules. Reads the cached bulk snapshot; no network. */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { parseArgs } from "node:util";
import { load } from "../src/core/cards.ts";

const { values } = parseArgs({ options: { bulk: { type: "string", default: ".cache/default-cards.jsonl.gz" },
	cards: { type: "string", default: "cards/standard.tsv" }, out: { type: "string", default: "cards/standard.art.tsv" } } });
const universe = load(values.cards!);
type Card = { id: string; name: string; lang?: string; digital?: boolean; promo?: boolean; full_art?: boolean; border_color?: string; released_at?: string;
	image_uris?: { normal?: string }; card_faces?: { image_uris?: { normal?: string } }[] };
// A plain, recent, paper printing reads best at board size: no promo frame, no full art, black border.
const score = (card: Card) => (card.promo ? 0 : 4) + (card.full_art ? 0 : 2) + (card.border_color === "black" ? 1 : 0);
const chosen = new Map<string, Card>();
for await (const line of createInterface({ input: createReadStream(values.bulk!).pipe(createGunzip()), crlfDelay: Infinity })) {
	const card = JSON.parse(line) as Card;
	if (!universe.cards.has(card.name) || card.lang !== "en" || card.digital || !(card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal)) continue;
	const held = chosen.get(card.name);
	if (!held || score(card) > score(held) || score(card) === score(held) && (card.released_at ?? "") > (held.released_at ?? "")) chosen.set(card.name, card);
}
const missing = [...universe.cards.keys()].filter((name) => !chosen.has(name));
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
writeFileSync(values.out!, [
	"# One Scryfall printing per card, for board images only. Rules and legality come from the card file.",
	`# Generated: ${universe.generated}`, `# Cards source: ${sha(values.cards!)}`, `# Bulk source: ${sha(values.bulk!)}`,
	"# Rebuild: node tools/card-art.ts --bulk SNAPSHOT --cards PINNED.tsv --out PINNED.art.tsv",
	"name\tscryfall", ...[...chosen].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, card]) => `${name}\t${card.id}`), "",
].join("\n"));
console.log(`${chosen.size} printings written to ${values.out}${missing.length ? `; no image for ${missing.join(", ")}` : ""}.`);
