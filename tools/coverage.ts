#!/usr/bin/env node
/** A source-pinned work inventory. Text tags locate candidates; they never grant card support. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { collection } from "../src/core/decks.ts";
import { PACKAGE_SEED, ledgerPath, storedPackages } from "../src/core/packages.ts";
import { printedFacts } from "../src/core/printed.ts";
import { matchup, universe } from "./matchup-fixture.ts";

const { values } = parseArgs({ options: { out: { type: "string", default: ".pi/standard-coverage" } } });
const decks = [...collection().values()].filter((deck) => /^https?:/.test(deck.source));
const stored = storedPackages(universe, { cache: PACKAGE_SEED }); // Reproducible shipped evidence, not this machine's cache.
const refusals = JSON.parse(readFileSync(ledgerPath(universe.generated), "utf8")) as Record<string, { reason: string; at: string }>;
const printed = printedFacts(universe, [...universe.cards.keys()]);
const tags: [string, RegExp][] = [
	["replacement/prevention", /\binstead\b|\bprevent\b|\bas .* enters\b/i],
	["copy", /\bcopy\b|\bcopies\b|\bcopying\b/i],
	["permission/alternative cost", /\bmay (?:cast|play)\b|rather than pay|without paying|\b(?:plot|warp|flashback|mayhem|evoke)\b/i],
	["hidden selection", /\blook at\b|\bsearch\b|\breveal\b/i],
	["history/counting", /\bthis turn\b|\bfirst .* each turn\b|\bsecond .* each turn\b|\bspent to cast\b/i],
	["choice/types/names", /\bchoose (?:a|an|one|two|three)\b|\bchosen (?:name|type|color)\b/i],
	["attached permanents", /\b(?:equip|reconfigure|enchant|bestow)\b/i],
	["multiface", /\btransform\b|\bRoom\b|\bAdventure\b|\bprepare\b/i],
	["counters/designations", /\bcounters?\b|\bemblem\b|\blevel\b|\bmonarch\b/i],
	["outside game/match", /\boutside the game\b|\bsideboard\b|\bcompanion\b/i],
];
const inventory = [...universe.cards.values()].sort((a, b) => a.name.localeCompare(b.name)).map((card) => {
	const pack = stored.get(card.name)?.package, refusal = refusals[card.name];
	const main = decks.filter((deck) => card.name in deck.main).map((deck) => deck.name);
	const sideboard = decks.filter((deck) => card.name in deck.sideboard).map((deck) => deck.name);
	const status = pack ? pack.deferred?.length ? "accepted-deferred" : "accepted-complete"
		: !printed[card.name]?.text ? "shared-printed" : refusal ? "recorded-refusal" : "unassessed";
	return { card: card.name, type: card.type, status, main, sideboard,
		deferredUses: pack?.deferred?.length ?? 0,
		tags: tags.filter(([, pattern]) => pattern.test(`${card.type}\n${card.oracle}`)).map(([name]) => name),
		...(refusal && !pack ? { refusal: refusal.reason, assessedAt: refusal.at } : {}) };
});
const count = (pick: (one: typeof inventory[number]) => boolean) => inventory.filter(pick).length;
const unresolved = (one: typeof inventory[number]) => one.status === "unassessed" || one.status === "recorded-refusal";
const populations = {
	allLegal: inventory.length, importedDecks: decks.length,
	main: count((one) => !!one.main.length), sideboardOnly: count((one) => !one.main.length && !!one.sideboard.length),
	outsideImportedLists: count((one) => !one.main.length && !one.sideboard.length),
};
const byStatus = Object.fromEntries(["shared-printed", "accepted-complete", "accepted-deferred", "recorded-refusal", "unassessed"]
	.map((status) => [status, count((one) => one.status === status)]));
const report = {
	generated: universe.generated, source: { cards: { ...matchup.cards, sha256: createHash("sha256").update(readFileSync(universe.path)).digest("hex") }, rules: matchup.rules },
	limits: "Shipped source-checked assessments, not legal-play certification. Deferred uses await interpretation. Refusals may predate mechanics. Text tags overlap and do not establish engine gaps. Legality is the pinned snapshot, not a live check.",
	populations, byStatus, deferredUses: inventory.reduce((n, one) => n + one.deferredUses, 0),
	decks: decks.map((deck) => ({ name: deck.name, mainMissing: inventory.filter((one) => unresolved(one) && one.main.includes(deck.name)).map((one) => one.card),
		sideboardMissing: inventory.filter((one) => unresolved(one) && one.sideboard.includes(deck.name)).map((one) => one.card) })),
	taggedUnassessed: Object.fromEntries(tags.map(([name]) => [name, count((one) => unresolved(one) && one.tags.includes(name))])),
	refusals: inventory.filter((one) => one.status === "recorded-refusal"),
};
mkdirSync(values.out!, { recursive: true });
writeFileSync(join(values.out!, "summary.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(values.out!, "cards.json"), JSON.stringify(inventory, null, 2) + "\n");
for (const status of ["unassessed", "recorded-refusal"]) writeFileSync(join(values.out!, `${status}.txt`), inventory.filter((one) => one.status === status).map((one) => one.card).join("\n") + "\n");
console.log(JSON.stringify({ populations, byStatus, deferredUses: report.deferredUses, taggedUnassessed: report.taggedUnassessed }, null, 2));
for (const deck of report.decks.filter((one) => one.mainMissing.length)) console.log(`${deck.name}: main-deck assessment needed: ${deck.mainMissing.join(", ")}`);
console.log(`Inventory and source fingerprints: ${values.out}`);
