/** A paid sacrifice retains its own pre-departure identity for later information reads. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Package } from "../src/core/language.ts";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { amount, objects, tableWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import { announce, establish, example, finish, main, offered, passBoth, step } from "./play.ts";

test("a named sacrifice binds only its paid incarnation and reads last known characteristics through replacement, later moves and token cessation", () => {
	const procedure = example("Repurpose an artifact into one costing one more"); checkProcedure(procedure);
	const missing = structuredClone(procedure); if (typeof missing.cost?.sacrifice === "object" && "as" in missing.cost.sacrifice) delete missing.cost.sacrifice.as;
	assert.throws(() => checkProcedure(missing), /used before/);
	for (const variant of ["ordinary", "exiled", "moved-again", "token", "transformed", "decline"] as const) {
		const table = start(standard, [{ deck: alpha(deck("Jeskai Artifacts")) }, { deck: alpha(deck("Jeskai Artifacts")) }], `cost-binding-${variant}`, undefined, { searchesFrom: 0 });
		main(table, 0); const bay = establish(table, 0, "Repurposing Bay", []);
		const other = establish(table, 0, "The Mind Stone", []);
		const source = establish(table, 0, variant === "transformed" ? "Braided Net // Braided Quipu" : "Candy Trail", []);
		let paid = source;
		if (variant === "token") {
			const prepared: Package = JSON.parse(readFileSync("prepared/packages/2026-10-10/simulacrum-synthesizer.json", "utf8")).package;
			const watch = prepared.registers.find(one => one.kind === "watch" && "instructions" in one.effect && one.effect.instructions.some(one => one.do === "token"))!;
			assert.equal(watch.kind, "watch"); if (watch.kind !== "watch" || !("instructions" in watch.effect)) assert.fail();
			const creation = watch.effect.instructions.find(one => one.do === "token")!; assert.equal(creation.do, "token");
			if (creation.do !== "token" || !creation.spec) assert.fail();
			commit(table, [{ do: "token", id: "synthesizer-construct", controller: 0, spec: creation.spec }], "resolve"); paid = table.things.get("synthesizer-construct")!;
		}
		if (variant === "transformed") commit(table, [{ do: "transform", what: source.id }], "resolve");
		if (variant === "exiled") commit(table, [{ do: "note", note: { kind: "register", on: { id: source.id, incarnation: source.incarnation }, by: 0, until: "indefinite", registration: { kind: "replace", basis: "Fixture death replacement", on: "dies", to: "exile" } } }], "resolve");
		commit(table, [{ do: "add-mana", who: 0, colors: ["C", "C"] }], "game-setup");
		const old = { id: paid.id, incarnation: paid.incarnation }, value = variant === "token" ? 0 : variant === "transformed" ? 3 : 1;
		const before = structuredClone(table), options = offered(table, procedure);
		assert.ok(!options.some(one => one.activation.cost.sacrificed?.some(ref => ref.id === bay.id)), "another artifact excludes the source");
		assert.ok(options.some(one => one.activation.cost.sacrificed?.some(ref => ref.id === other.id)), "other legal sacrifices remain offered");
		assert.deepEqual(table, before, "listing binds no physical cost");
		const use = announce(table, procedure, one => one.activation.cost.sacrificed?.some(ref => ref.id === paid.id) === true);
		assert.deepEqual(use.activation.bound?.["paid-artifact"], { objects: [old], players: [] });
		assert.equal(paid.zone, variant === "exiled" ? "exile" : "graveyard"); assert.equal(bay.tapped, true); assert.equal(table.seats[0]!.pool.length, 0);
		if (variant === "moved-again") commit(table, [{ do: "move", what: paid.id, to: "hand", reason: "resolve" }], "resolve");
		finish(table); if (variant === "token") assert.equal(table.things.has(paid.id), false);
		const pending = structuredClone(table), scope = { world: tableWorld(table), controller: 0, bound: use.activation.bound };
		assert.equal(amount(scope, { manaValue: "bound:paid-artifact" }), value);
		assert.deepEqual(objects(scope, "bound:paid-artifact"), [], "information cannot move a departed incarnation");
		passBoth(table); step(table); // Begin the constrained private search.
		const searching = structuredClone(table), choices = nextDecision(table)!;
		const candidates = choices.options.flatMap(one => one.objects ?? []).map(ref => table.things.get(ref.id)!);
		assert.ok(candidates.length > 0);
		assert.ok(candidates.every(one => amount({ world: tableWorld(table), controller: 0, source: one }, { manaValue: "this" }) === value + 1));
		for (const one of candidates) assert.ok(!project(table, 1).objects!.some(shown => shown.id === one.id), "the search stays private");
		const choice = variant === "decline" ? choices.options.find(one => one.id.endsWith(":done"))! : choices.options.find(one => one.objects?.length)!;
		assert.ok(choice); const found = choice.objects?.[0]; apply(table, choice.id, "model", "chosen"); finish(table);
		if (found) assert.equal(table.things.get(found.id)!.zone, "battlefield");
		assert.ok(table.log.at(-1)?.changes.some(one => one.do === "shuffle") || table.log.some(one => one.at >= searching.ledger.length && one.changes.some(change => change.do === "shuffle")));
		for (const prefix of [pending, searching]) assert.deepEqual(relive(prefix, table.ledger.slice(prefix.ledger.length)), table);
		if (variant !== "moved-again") assert.deepEqual(relive(before, table.ledger.slice(before.ledger.length)), table);
	}
});
