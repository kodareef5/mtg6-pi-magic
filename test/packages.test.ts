/** Reusable equipment must match its source, remain unbound, and never replace a game's accepted work. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStored, saveAssessed, storedPackages, storePackage, writeRecord } from "../src/core/packages.ts";
import { shipped } from "../src/core/printed.ts";
import { matchup } from "./play.ts";

test("stored preparation is source-checked, atomic, and separate from refusals and carried work", () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-packages-")), universe = shipped();
	try {
		const accepted = storedPackages(universe);
		assert.equal(accepted.has(undefined as never), false, "the ledger is not a package");
		const pack = accepted.get("Sazh's Chocobo")!.package;
		storePackage(universe, pack, "test-model", dir);
		writeRecord(join(dir, universe.generated, "ledger.json"), { refused: { reason: "unsupported" } });
		assert.equal(storedPackages(universe, dir).size, 1);
		assert.ok(readdirSync(join(dir, universe.generated)).every((file) => file.endsWith(".json")), "writes leave no temporary files");
		const table = matchup("stored");
		assert.equal(loadStored(table, universe, () => false, dir), 2, "both seats learn the registered universe");
		const before = structuredClone(table);
		assert.equal(loadStored(table, universe, () => false, dir), 0);
		assert.deepEqual(table, before, "reloading cannot change accepted work");
		assert.equal(saveAssessed(table, universe, undefined, dir), 0);
		const changed = structuredClone(universe);
		changed.cards.get(pack.card)!.mana = "{5}{G}";
		assert.equal(storedPackages(changed, dir).size, 0, "a same-date source change invalidates reuse");
		const path = join(dir, universe.generated, "sazh-s-chocobo.json");
		const saved = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(path, JSON.stringify({ ...saved, contract: 0 }));
		assert.equal(storedPackages(universe, dir).size, 0, "an old interpreter contract needs assessment");
		storePackage(universe, accepted.get("Fabled Passage")!.package, "test-model", dir);
		assert.equal(loadStored(matchup("complete"), universe, () => true, dir), 0, "strategy-off setup cannot load deferred uses");
		assert.throws(() => storePackage(universe, { ...pack, assessed: undefined }, undefined, dir), /not assessed/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
