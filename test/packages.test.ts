/** Reusable equipment must match its source, remain unbound, and never replace a game's accepted work. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE_SEED, admittedAlpha, loadStored, saveAssessed, storedPackages, storePackage, writeRecord } from "../src/core/packages.ts";
import { shipped } from "../src/core/printed.ts";
import { deck } from "../src/core/decks.ts";
import { matchup } from "./play.ts";

test("stored preparation is source-checked, atomic, and separate from refusals and carried work", () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-packages-")), universe = shipped();
	const notices: string[] = [], store = { seed: dir, cache: dir, notice: (message: string) => notices.push(message) };
	try {
		const accepted = storedPackages(universe, { cache: PACKAGE_SEED });
		assert.equal(accepted.has(undefined as never), false, "the ledger is not a package");
		const pack = accepted.get("Sazh's Chocobo")!.package;
		storePackage(universe, pack, "test-model", store);
		writeRecord(join(dir, universe.generated, "ledger.json"), { refused: { reason: "unsupported" } });
		assert.equal(storedPackages(universe, store).size, 1);
		assert.ok(readdirSync(join(dir, universe.generated)).every((file) => file.endsWith(".json")), "writes leave no temporary files");
		const table = matchup("stored");
		assert.equal(loadStored(table, universe, () => false, store), 2, "both seats learn the registered universe");
		const before = structuredClone(table);
		assert.equal(loadStored(table, universe, () => false, store), 0);
		assert.deepEqual(table, before, "reloading cannot change accepted work");
		assert.equal(saveAssessed(table, universe, undefined, store), 0);
		const changed = structuredClone(universe);
		changed.cards.get(pack.card)!.mana = "{5}{G}";
		assert.equal(storedPackages(changed, store).size, 0, "a same-date source change invalidates reuse");
		const path = join(dir, universe.generated, "sazh-s-chocobo.json");
		const saved = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(path, JSON.stringify({ ...saved, contract: 0 }));
		assert.equal(storedPackages(universe, store).size, 0, "an old interpreter contract needs assessment");
		storePackage(universe, accepted.get("Fabled Passage")!.package, "test-model", store);
		assert.equal(loadStored(matchup("complete"), universe, () => true, store), 0, "strategy-off setup cannot load deferred uses");
		assert.equal(storePackage(universe, { ...pack, assessed: undefined }, undefined, store), false);
		assert.match(notices.at(-1)!, /[Nn]ot assessed/);
		writeFileSync(join(dir, universe.generated, "corrupt.json"), "{torn");
		writeFileSync(join(dir, universe.generated, "invalid.json"), "null");
		assert.equal(storedPackages(universe, store).size, 1, "bad records do not hide the valid deferred package");
		assert.ok(notices.some((note) => note.includes("corrupt.json")));
		assert.ok(notices.some((note) => note.includes("interpreter contract changed")));

		const seed = join(dir, "seed"), cache = join(dir, "cache"), split = { ...store, seed, cache };
		storePackage(universe, pack, "shipped", { ...split, cache: seed });
		const seedPath = join(seed, universe.generated, "sazh-s-chocobo.json"), seedBytes = readFileSync(seedPath, "utf8");
		storePackage(universe, pack, "local", split);
		assert.equal(storedPackages(universe, split).get(pack.card)!.model, "local", "compatible local preparation overrides the seed");
		assert.equal(readFileSync(seedPath, "utf8"), seedBytes, "cache writes leave the shipped seed untouched");
		writeFileSync(join(cache, universe.generated, "sazh-s-chocobo.json"), "corrupt");
		assert.equal(storedPackages(universe, split).get(pack.card)!.model, "shipped", "bad overrides leave the seed usable");
		const blocked = join(dir, "not-a-directory"); writeFileSync(blocked, "read-only store substitute");
		assert.equal(storePackage(universe, pack, "test", { ...store, cache: blocked }), false);
		assert.equal(saveAssessed(table, universe, undefined, { ...store, seed: blocked, cache: blocked }), 0);
		assert.ok(notices.some((note) => note.includes("Could not cache preparation")));
		assert.equal(loadStored(matchup("seed-only"), universe, () => false, { ...split, cache: blocked }), 2,
			"an unreadable cache does not prevent seating from the seed");
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("random alpha admission checks every main card without modifying tournament sideboards", () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-alpha-pool-")), universe = shipped();
	const store = { seed: dir, cache: dir, notice: () => {} }, original = deck("Selesnya Landfall");
	try {
		assert.equal(admittedAlpha(universe, store).length, 0);
		const accepted = storedPackages(universe, { cache: PACKAGE_SEED });
		for (const name of Object.keys(original.main)) if (accepted.has(name)) storePackage(universe, accepted.get(name)!.package, "test", store);
		const pool = admittedAlpha(universe, store), entry = pool.find((one) => one.name === original.name)!;
		assert.ok(entry); assert.deepEqual(entry.main, original.main); assert.deepEqual(entry.sideboard, {});
		assert.deepEqual(deck(original.name), original); assert.ok(Object.keys(original.sideboard).length);
		assert.ok(!pool.some((one) => one.name === "4c Control"), "an unassessed main deck cannot enter the random pool");
		assert.ok(accepted.get("Shared Roots")!.package.deferred?.length, "deferred uses do not block standing admission");
		const changed = structuredClone(universe); changed.cards.get("Shared Roots")!.oracle += " Changed source.";
		assert.ok(!admittedAlpha(changed, store).some((one) => one.name === original.name), "a stale main-card interpretation blocks admission");
		const illegal = structuredClone(universe); illegal.cards.get("Shared Roots")!.legal.standard = "B";
		assert.ok(!admittedAlpha(illegal, store).some((one) => one.name === original.name), "source coverage cannot override format legality");
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
